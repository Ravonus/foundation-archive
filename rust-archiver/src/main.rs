use std::{
    io::ErrorKind,
    net::TcpListener as StdTcpListener,
    num::NonZeroUsize,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex as StdMutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, Context};
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use dashmap::DashMap;
use futures_util::StreamExt;
use lru::LruCache;
use reqwest::{
    header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE, USER_AGENT},
    Client,
};
use serde::{Deserialize, Serialize};
use tokio::{
    fs,
    io::{AsyncWriteExt, BufWriter},
    net::TcpListener,
    sync::{oneshot, Mutex},
    time::timeout,
};
use tracing::{info, warn};
use tray_menu::{
    Divider, Icon, MouseButton, MouseButtonState, PopupMenu, TextEntry, TrayIconBuilder,
    TrayIconEvent,
};

const ROOT_FILE_SENTINEL: &str = "__root__";
const STREAM_WRITE_BUFFER_BYTES: usize = 1024 * 1024;
const STREAM_PROGRESS_INTERVAL_BYTES: u64 = 32 * 1024 * 1024;
const STREAM_CHUNK_TIMEOUT_SECS: u64 = 120;

#[derive(Clone)]
struct AppState {
    client: Client,
    inflight: Arc<DashMap<String, Arc<Mutex<()>>>>,
    recent_results: Arc<Mutex<LruCache<String, ArchiveRootResponse>>>,
    inline_memory_max_bytes: u64,
}

#[derive(Clone)]
struct ShutdownController {
    requested: Arc<AtomicBool>,
    server_shutdown: Arc<StdMutex<Option<oneshot::Sender<()>>>>,
}

struct ServiceHandle {
    join_handle: Option<thread::JoinHandle<anyhow::Result<()>>>,
}

struct TrayConfig {
    bind: String,
    desktop_url: String,
    health_url: String,
}

#[derive(Debug, Deserialize)]
struct ArchiveRootRequest {
    cid: String,
    relative_path: Option<String>,
    gateway_url: Option<String>,
    original_url: Option<String>,
    final_root_dir: String,
    hot_root_dir: String,
}

#[derive(Debug, Serialize, Clone)]
struct ArchiveRootResponse {
    absolute_path: String,
    local_directory: String,
    byte_size: u64,
    mime_type: Option<String>,
    from_memory_cache: bool,
    used_hot_cache: bool,
    existed_in_cold_storage: bool,
}

#[derive(Debug, Deserialize)]
struct PinCidRequest {
    cid: String,
    kubo_api_url: String,
    kubo_api_auth_header: Option<String>,
}

#[derive(Debug, Serialize)]
struct PinCidResponse {
    pinned: bool,
    provider: &'static str,
    reference: Option<String>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    service: &'static str,
    recent_cache_entries: usize,
    inline_memory_max_bytes: u64,
}

#[derive(Debug)]
struct AppError {
    status: StatusCode,
    message: String,
}

impl AppError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(serde_json::json!({
                "error": self.message,
            })),
        )
            .into_response()
    }
}

fn trim_trailing_slash(value: &str) -> &str {
    value.trim_end_matches('/')
}

fn clean_relative_path(relative_path: Option<&str>) -> Result<String, AppError> {
    let candidate = relative_path.unwrap_or("").trim_start_matches('/');

    if candidate.contains("..") {
        return Err(AppError::bad_request(
            "relative_path cannot escape the archive root",
        ));
    }

    if candidate.is_empty() {
        return Ok(ROOT_FILE_SENTINEL.to_string());
    }

    Ok(candidate.to_string())
}

fn cid_root(storage_root: &Path, cid: &str) -> PathBuf {
    storage_root.join("ipfs").join(cid)
}

fn final_file_path(storage_root: &Path, cid: &str, relative_path: &str) -> PathBuf {
    cid_root(storage_root, cid).join(relative_path)
}

async fn ensure_parent_directory(path: &Path) -> Result<(), AppError> {
    let parent = path.parent().ok_or_else(|| {
        AppError::internal("Unable to determine the archive directory for the target path.")
    })?;

    fs::create_dir_all(parent).await.map_err(|error| {
        AppError::internal(format!("Unable to create archive directory: {error}"))
    })?;

    Ok(())
}

async fn metadata_len(path: &Path) -> Result<u64, AppError> {
    fs::metadata(path)
        .await
        .map(|metadata| metadata.len())
        .map_err(|error| AppError::internal(format!("Unable to stat archived file: {error}")))
}

async fn discard_hot_copy(hot_path: &Path) {
    match fs::remove_file(hot_path).await {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            warn!(
                "Unable to clear promoted hot archive file {}: {error}",
                hot_path.display()
            );
        }
    }
}

async fn clone_hot_into_cold(hot_path: &Path, cold_path: &Path) -> Result<(), AppError> {
    if fs::metadata(cold_path).await.is_ok() {
        discard_hot_copy(hot_path).await;
        return Ok(());
    }

    ensure_parent_directory(cold_path).await?;

    if let Err(error) = fs::hard_link(hot_path, cold_path).await {
        if error.kind() != ErrorKind::AlreadyExists {
            fs::copy(hot_path, cold_path).await.map_err(|copy_error| {
                AppError::internal(format!(
                    "Unable to promote the hot archive file into cold storage: {copy_error}"
                ))
            })?;
        }
    }

    discard_hot_copy(hot_path).await;

    Ok(())
}

fn unique_temp_path(target_path: &Path) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    let mut file_name = target_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "archive".to_string());
    file_name.push_str(&format!(".part-{nanos}"));

    target_path.with_file_name(file_name)
}

async fn write_small_response_to_hot(hot_path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    ensure_parent_directory(hot_path).await?;
    let temp_path = unique_temp_path(hot_path);

    fs::write(&temp_path, bytes).await.map_err(|error| {
        AppError::internal(format!("Unable to write the hot cache file: {error}"))
    })?;

    match fs::rename(&temp_path, hot_path).await {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            let _ = fs::remove_file(&temp_path).await;
        }
        Err(error) => {
            return Err(AppError::internal(format!(
                "Unable to finalize the hot cache file: {error}"
            )));
        }
    }

    Ok(())
}

async fn stream_response_to_hot(
    hot_path: &Path,
    response: reqwest::Response,
    expected_bytes: Option<u64>,
) -> Result<u64, AppError> {
    ensure_parent_directory(hot_path).await?;
    let temp_path = unique_temp_path(hot_path);

    match stream_response_body(&temp_path, response, expected_bytes).await {
        Ok(written) => {
            match fs::rename(&temp_path, hot_path).await {
                Ok(()) => {}
                Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                    let _ = fs::remove_file(&temp_path).await;
                }
                Err(error) => {
                    let _ = fs::remove_file(&temp_path).await;
                    return Err(AppError::internal(format!(
                        "Unable to finalize the hot cache file: {error}"
                    )));
                }
            }
            Ok(written)
        }
        Err(error) => {
            let _ = fs::remove_file(&temp_path).await;
            Err(error)
        }
    }
}

async fn stream_response_body(
    temp_path: &Path,
    response: reqwest::Response,
    expected_bytes: Option<u64>,
) -> Result<u64, AppError> {
    let file = fs::File::create(temp_path).await.map_err(|error| {
        AppError::internal(format!("Unable to create the hot cache file: {error}"))
    })?;
    let mut writer = BufWriter::with_capacity(STREAM_WRITE_BUFFER_BYTES, file);

    let mut written = 0_u64;
    let mut next_progress_at = STREAM_PROGRESS_INTERVAL_BYTES;
    let chunk_timeout = Duration::from_secs(STREAM_CHUNK_TIMEOUT_SECS);
    let mut stream = response.bytes_stream();

    loop {
        let next_chunk = match timeout(chunk_timeout, stream.next()).await {
            Ok(value) => value,
            Err(_) => {
                return Err(AppError::internal(format!(
                    "Streaming download stalled after {} bytes with no data for {STREAM_CHUNK_TIMEOUT_SECS}s",
                    written
                )));
            }
        };

        let Some(chunk) = next_chunk else {
            break;
        };

        let chunk = chunk.map_err(|error| {
            AppError::internal(format!(
                "Streaming download failed after {written} bytes: {error}"
            ))
        })?;

        if chunk.is_empty() {
            continue;
        }

        writer.write_all(&chunk).await.map_err(|error| {
            AppError::internal(format!("Unable to write archive bytes: {error}"))
        })?;
        written += chunk.len() as u64;

        if written >= next_progress_at {
            match expected_bytes {
                Some(total) if total > 0 => {
                    info!(
                        "Archiving stream progress: {written}/{total} bytes ({:.1}%)",
                        (written as f64 / total as f64) * 100.0
                    );
                }
                _ => info!("Archiving stream progress: {written} bytes"),
            }
            next_progress_at = next_progress_at.saturating_add(STREAM_PROGRESS_INTERVAL_BYTES);
        }
    }

    writer
        .flush()
        .await
        .map_err(|error| AppError::internal(format!("Unable to flush archive bytes: {error}")))?;
    let file = writer.into_inner();
    file.sync_all()
        .await
        .map_err(|error| AppError::internal(format!("Unable to sync archive bytes: {error}")))?;
    drop(file);

    Ok(written)
}

async fn maybe_pin_with_kubo(
    client: &Client,
    request: &PinCidRequest,
) -> Result<PinCidResponse, AppError> {
    let endpoint = format!(
        "{}/api/v0/pin/add?arg={}",
        trim_trailing_slash(&request.kubo_api_url),
        request.cid
    );
    let mut builder = client
        .post(endpoint)
        .header(USER_AGENT, "foundation-archive-archiver/0.1");

    if let Some(header) = request
        .kubo_api_auth_header
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        builder = builder.header(AUTHORIZATION, header);
    }

    let response = builder.send().await.map_err(|error| {
        AppError::internal(format!("Unable to reach the Kubo pin API: {error}"))
    })?;

    if !response.status().is_success() {
        return Err(AppError::internal(format!(
            "Kubo pin failed for {} with status {}",
            request.cid,
            response.status()
        )));
    }

    let payload = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| {
            AppError::internal(format!("Unable to decode the Kubo pin response: {error}"))
        })?;

    Ok(PinCidResponse {
        pinned: true,
        provider: "kubo",
        reference: payload
            .get("Pinned")
            .and_then(|value| value.as_str())
            .map(ToOwned::to_owned)
            .or_else(|| {
                payload
                    .get("Pins")
                    .and_then(|value| value.as_array())
                    .and_then(|pins| pins.first())
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned)
            })
            .or_else(|| Some(request.cid.clone())),
    })
}

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let cache_len = state.recent_results.lock().await.len();

    Json(HealthResponse {
        ok: true,
        service: "foundation-archive-archiver",
        recent_cache_entries: cache_len,
        inline_memory_max_bytes: state.inline_memory_max_bytes,
    })
}

async fn pin_cid(
    State(state): State<AppState>,
    Json(request): Json<PinCidRequest>,
) -> Result<Json<PinCidResponse>, AppError> {
    if request.cid.trim().is_empty() {
        return Err(AppError::bad_request("cid is required"));
    }

    if request.kubo_api_url.trim().is_empty() {
        return Err(AppError::bad_request("kubo_api_url is required"));
    }

    let result = maybe_pin_with_kubo(&state.client, &request).await?;
    Ok(Json(result))
}

async fn archive_root(
    State(state): State<AppState>,
    Json(request): Json<ArchiveRootRequest>,
) -> Result<Json<ArchiveRootResponse>, AppError> {
    if request.cid.trim().is_empty() {
        return Err(AppError::bad_request("cid is required"));
    }

    let relative_path = clean_relative_path(request.relative_path.as_deref())?;
    let key = format!("{}:{}", request.cid.trim(), relative_path);

    if let Some(cached) = {
        let mut cache = state.recent_results.lock().await;
        cache.get(&key).cloned()
    } {
        if fs::metadata(&cached.absolute_path).await.is_ok() {
            return Ok(Json(ArchiveRootResponse {
                from_memory_cache: true,
                ..cached
            }));
        }
    }

    let lock = state
        .inflight
        .entry(key.clone())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone();
    let _guard = lock.lock().await;

    let final_root_dir = PathBuf::from(&request.final_root_dir);
    let hot_root_dir = PathBuf::from(&request.hot_root_dir);
    let cold_directory = cid_root(&final_root_dir, request.cid.trim());
    let cold_path = final_file_path(&final_root_dir, request.cid.trim(), &relative_path);
    let hot_path = final_file_path(&hot_root_dir, request.cid.trim(), &relative_path);

    let build_response =
        |byte_size: u64,
         mime_type: Option<String>,
         from_memory_cache: bool,
         used_hot_cache: bool,
         existed_in_cold_storage: bool| ArchiveRootResponse {
            absolute_path: cold_path.to_string_lossy().to_string(),
            local_directory: cold_directory.to_string_lossy().to_string(),
            byte_size,
            mime_type,
            from_memory_cache,
            used_hot_cache,
            existed_in_cold_storage,
        };

    if fs::metadata(&cold_path).await.is_ok() {
        let byte_size = metadata_len(&cold_path).await?;
        let response = build_response(byte_size, None, false, false, true);
        state.recent_results.lock().await.put(key, response.clone());
        return Ok(Json(response));
    }

    if fs::metadata(&hot_path).await.is_ok() {
        clone_hot_into_cold(&hot_path, &cold_path).await?;
        let byte_size = metadata_len(&cold_path).await?;
        let response = build_response(byte_size, None, false, true, false);
        state.recent_results.lock().await.put(key, response.clone());
        return Ok(Json(response));
    }

    let source_url = request
        .gateway_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or(request
            .original_url
            .as_deref()
            .filter(|value| !value.trim().is_empty()))
        .ok_or_else(|| AppError::bad_request("gateway_url or original_url is required"))?;

    let response = state
        .client
        .get(source_url)
        .header(USER_AGENT, "foundation-archive-archiver/0.1")
        .send()
        .await
        .map_err(|error| AppError::internal(format!("Unable to fetch the source file: {error}")))?;

    if !response.status().is_success() {
        return Err(AppError::internal(format!(
            "Failed to download {} with status {}",
            source_url,
            response.status()
        )));
    }

    let mime_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    let content_length = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());

    let byte_size = if let Some(content_length) = content_length {
        if content_length > 0 && content_length <= state.inline_memory_max_bytes {
            let bytes = response.bytes().await.map_err(|error| {
                AppError::internal(format!("Unable to buffer the archive response: {error}"))
            })?;
            write_small_response_to_hot(&hot_path, bytes.as_ref()).await?;
            bytes.len() as u64
        } else {
            info!(
                "Streaming large archive payload for {} ({} bytes)",
                request.cid.trim(),
                content_length
            );
            stream_response_to_hot(&hot_path, response, Some(content_length)).await?
        }
    } else {
        info!(
            "Streaming archive payload for {} (content length unknown)",
            request.cid.trim()
        );
        stream_response_to_hot(&hot_path, response, None).await?
    };

    clone_hot_into_cold(&hot_path, &cold_path).await?;

    let response = build_response(byte_size, mime_type, false, false, false);
    state.recent_results.lock().await.put(key, response.clone());

    Ok(Json(response))
}

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(default)
}

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(default)
}

fn env_string(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn build_app_state(cache_items: usize, inline_memory_max_bytes: u64) -> anyhow::Result<AppState> {
    let cache_capacity = NonZeroUsize::new(cache_items.max(1))
        .ok_or_else(|| anyhow!("ARCHIVE_ARCHIVER_MEMORY_CACHE_ITEMS must be positive"))?;

    Ok(AppState {
        client: Client::builder()
            .http2_adaptive_window(true)
            .pool_max_idle_per_host(32)
            .connect_timeout(Duration::from_secs(30))
            .read_timeout(Duration::from_secs(STREAM_CHUNK_TIMEOUT_SECS))
            .tcp_keepalive(Some(Duration::from_secs(60)))
            .build()
            .context("Unable to build the archive HTTP client")?,
        inflight: Arc::new(DashMap::new()),
        recent_results: Arc::new(Mutex::new(LruCache::new(cache_capacity))),
        inline_memory_max_bytes,
    })
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/archive/root", post(archive_root))
        .route("/pin/cid", post(pin_cid))
        .with_state(state)
}

fn bind_listener(bind: &str) -> anyhow::Result<StdTcpListener> {
    let listener = StdTcpListener::bind(bind)
        .with_context(|| format!("Unable to bind foundation-archive-archiver on {bind}"))?;
    listener
        .set_nonblocking(true)
        .with_context(|| format!("Unable to configure the archiver listener on {bind}"))?;
    Ok(listener)
}

impl ShutdownController {
    fn new(sender: oneshot::Sender<()>) -> Self {
        Self {
            requested: Arc::new(AtomicBool::new(false)),
            server_shutdown: Arc::new(StdMutex::new(Some(sender))),
        }
    }

    fn is_requested(&self) -> bool {
        self.requested.load(Ordering::SeqCst)
    }

    fn request_shutdown(&self) {
        if self.requested.swap(true, Ordering::SeqCst) {
            return;
        }

        if let Some(sender) = self
            .server_shutdown
            .lock()
            .expect("shutdown mutex poisoned")
            .take()
        {
            let _ = sender.send(());
        }
    }
}

impl ServiceHandle {
    fn wait(mut self) -> anyhow::Result<()> {
        let Some(join_handle) = self.join_handle.take() else {
            return Ok(());
        };

        match join_handle.join() {
            Ok(result) => result,
            Err(_) => Err(anyhow!("foundation-archive-archiver thread panicked")),
        }
    }
}

async fn run_archiver_server(
    listener: StdTcpListener,
    bind: String,
    state: AppState,
    shutdown_rx: oneshot::Receiver<()>,
) -> anyhow::Result<()> {
    let listener =
        TcpListener::from_std(listener).context("Unable to hand the listener to Tokio")?;
    let router = build_router(state);

    info!("foundation-archive-archiver listening on http://{bind}");

    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await
        .context("Axum server exited unexpectedly")?;

    Ok(())
}

fn spawn_archiver_service(
    listener: StdTcpListener,
    bind: String,
    state: AppState,
) -> anyhow::Result<(ShutdownController, ServiceHandle)> {
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let shutdown = ShutdownController::new(shutdown_tx);
    let join_handle = thread::Builder::new()
        .name("foundation-archive-archiver".to_string())
        .spawn(move || -> anyhow::Result<()> {
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .context("Unable to build the archiver runtime")?;
            runtime.block_on(run_archiver_server(listener, bind, state, shutdown_rx))
        })
        .context("Unable to start the archiver thread")?;

    Ok((
        shutdown,
        ServiceHandle {
            join_handle: Some(join_handle),
        },
    ))
}

fn install_ctrlc_handler(shutdown: ShutdownController) -> anyhow::Result<()> {
    ctrlc::set_handler(move || {
        shutdown.request_shutdown();
    })
    .context("Unable to install the shutdown handler")
}

fn build_tray_icon() -> anyhow::Result<Icon> {
    const SIZE: u32 = 32;
    let mut rgba = vec![0_u8; (SIZE * SIZE * 4) as usize];

    for y in 0..SIZE {
        for x in 0..SIZE {
            let idx = ((y * SIZE + x) * 4) as usize;
            let dx = x as i32 - 16;
            let dy = y as i32 - 16;
            let dist2 = dx * dx + dy * dy;

            let pixel = if dist2 <= 196 {
                [25, 32, 45, 255]
            } else if dist2 <= 225 {
                [223, 179, 71, 255]
            } else {
                [0, 0, 0, 0]
            };

            rgba[idx..idx + 4].copy_from_slice(&pixel);
        }
    }

    for y in 9..24 {
        for x in 11..21 {
            let idx = ((y * SIZE + x) * 4) as usize;
            rgba[idx..idx + 4].copy_from_slice(&[244, 239, 224, 255]);
        }
    }

    for y in 12..16 {
        for x in 9..23 {
            let idx = ((y * SIZE + x) * 4) as usize;
            rgba[idx..idx + 4].copy_from_slice(&[223, 179, 71, 255]);
        }
    }

    for y in 18..20 {
        for x in 13..19 {
            let idx = ((y * SIZE + x) * 4) as usize;
            rgba[idx..idx + 4].copy_from_slice(&[25, 32, 45, 255]);
        }
    }

    Icon::from_rgba(rgba, SIZE, SIZE).map_err(|error| anyhow!("Unable to build tray icon: {error}"))
}

#[cfg(target_os = "macos")]
fn initialize_macos_app() {
    use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};
    use objc2_foundation::MainThreadMarker;

    if let Some(mtm) = MainThreadMarker::new() {
        let app = NSApplication::sharedApplication(mtm);
        app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
    }
}

#[cfg(not(target_os = "macos"))]
fn initialize_macos_app() {}

fn handle_menu_action(action_id: &str, tray: &TrayConfig, shutdown: &ShutdownController) {
    match action_id {
        "open_desktop" => {
            if let Err(error) = webbrowser::open(&tray.desktop_url) {
                warn!(
                    "Unable to open the desktop board at {}: {error}",
                    tray.desktop_url
                );
            }
        }
        "open_health" => {
            if let Err(error) = webbrowser::open(&tray.health_url) {
                warn!(
                    "Unable to open the local health page at {}: {error}",
                    tray.health_url
                );
            }
        }
        "quit" => shutdown.request_shutdown(),
        _ => {}
    }
}

fn run_tray_ui(tray: &TrayConfig, shutdown: &ShutdownController) -> anyhow::Result<()> {
    initialize_macos_app();

    let _tray_icon = TrayIconBuilder::new()
        .with_icon(build_tray_icon()?)
        .with_tooltip(format!("Foundation Archive helper ({})", tray.bind))
        .build()
        .context("Unable to create the toolbar icon")?;

    let receiver = TrayIconEvent::receiver();
    while !shutdown.is_requested() {
        if let Ok(event) = receiver.try_recv() {
            if let TrayIconEvent::Click {
                button,
                button_state,
                position,
                ..
            } = event
            {
                if button_state == MouseButtonState::Up
                    && matches!(button, MouseButton::Left | MouseButton::Right)
                {
                    let mut menu = PopupMenu::new();
                    let desktop_entry = TextEntry::of("open_desktop", "Open desktop board");
                    let health_entry = TextEntry::of("open_health", "Open local health");
                    let quit_entry = TextEntry::of("quit", "Quit");
                    menu.add(&desktop_entry);
                    menu.add(&health_entry);
                    menu.add(&Divider);
                    menu.add(&quit_entry);

                    if let Some(id) = menu.popup(position) {
                        handle_menu_action(id.0.as_str(), tray, shutdown);
                    }
                }
            }
        }

        thread::sleep(Duration::from_millis(50));
    }

    Ok(())
}

fn wait_for_shutdown(shutdown: &ShutdownController) {
    while !shutdown.is_requested() {
        thread::sleep(Duration::from_millis(100));
    }
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "foundation_archive_archiver=info".into()),
        )
        .with_target(false)
        .compact()
        .init();

    let bind = env_string("ARCHIVE_ARCHIVER_BIND", "127.0.0.1:43131");
    let site_url = env_string("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    let cache_items = env_usize("ARCHIVE_ARCHIVER_MEMORY_CACHE_ITEMS", 512);
    let inline_memory_max_bytes =
        env_u64("ARCHIVE_ARCHIVER_INLINE_MEMORY_MAX_BYTES", 8 * 1024 * 1024);

    let listener = bind_listener(&bind)?;
    let state = build_app_state(cache_items, inline_memory_max_bytes)?;
    let (shutdown, service) = spawn_archiver_service(listener, bind.clone(), state)?;
    install_ctrlc_handler(shutdown.clone())?;

    let tray = TrayConfig {
        bind: bind.clone(),
        desktop_url: format!("{}/desktop", trim_trailing_slash(&site_url)),
        health_url: format!("http://{bind}/health"),
    };

    if let Err(error) = run_tray_ui(&tray, &shutdown) {
        warn!("Unable to create the tray menu: {error}. Running without the toolbar icon.");
        wait_for_shutdown(&shutdown);
    }

    shutdown.request_shutdown();
    service.wait()?;

    Ok(())
}

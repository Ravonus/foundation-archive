"use client";

import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

type VirtualizedArtworkGridProps<TItem> = {
  items: TItem[];
  renderItem: (item: TItem, index: number) => ReactNode;
};

type RowMetric = {
  top: number;
  height: number;
  bottom: number;
};

const GRID_ROW_GAP = 48;

function columnCountForWidth(width: number) {
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

function estimateRowHeight(columnCount: number) {
  switch (columnCount) {
    case 3:
      return 500;
    case 2:
      return 560;
    default:
      return 620;
  }
}

function chunkIntoRows<TItem>(items: TItem[], columnCount: number) {
  const rows: TItem[][] = [];
  for (let index = 0; index < items.length; index += columnCount) {
    rows.push(items.slice(index, index + columnCount));
  }
  return rows;
}

function buildRowMetrics(
  rowCount: number,
  rowHeights: Record<number, number>,
  columnCount: number,
) {
  const metrics: RowMetric[] = [];
  let top = 0;
  const fallbackHeight = estimateRowHeight(columnCount);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const height = rowHeights[rowIndex] ?? fallbackHeight;
    metrics.push({
      top,
      height,
      bottom: top + height,
    });
    top += height + GRID_ROW_GAP;
  }

  return {
    metrics,
    totalHeight: rowCount > 0 ? top - GRID_ROW_GAP : 0,
  };
}

function findFirstVisibleRow(metrics: RowMetric[], threshold: number) {
  let low = 0;
  let high = metrics.length - 1;
  let answer = metrics.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const entry = metrics[middle];
    if (!entry) break;

    if (entry.bottom >= threshold) {
      answer = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return answer;
}

function findLastVisibleRow(metrics: RowMetric[], threshold: number) {
  let low = 0;
  let high = metrics.length - 1;
  let answer = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const entry = metrics[middle];
    if (!entry) break;

    if (entry.top <= threshold) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return answer;
}

function MeasuredRow({
  children,
  top,
  rowIndex,
  onHeightChange,
}: {
  children: ReactNode;
  top: number;
  rowIndex: number;
  onHeightChange: (rowIndex: number, height: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;

    const reportHeight = () => {
      onHeightChange(rowIndex, node.getBoundingClientRect().height);
    };

    reportHeight();

    const resizeObserver = new ResizeObserver(() => {
      reportHeight();
    });
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, [onHeightChange, rowIndex]);

  return (
    <div ref={rowRef} className="absolute inset-x-0" style={{ top }}>
      {children}
    </div>
  );
}

export function VirtualizedArtworkGrid<TItem>({
  items,
  renderItem,
}: VirtualizedArtworkGridProps<TItem>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousColumnCountRef = useRef(1);
  const previousItemCountRef = useRef(items.length);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollState, setScrollState] = useState({
    top: 0,
    height: 0,
    containerTop: 0,
  });
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});

  const columnCount = columnCountForWidth(containerWidth);
  const rows = useMemo(
    () => chunkIntoRows(items, columnCount),
    [columnCount, items],
  );
  const { metrics, totalHeight } = useMemo(
    () => buildRowMetrics(rows.length, rowHeights, columnCount),
    [columnCount, rowHeights, rows.length],
  );

  const syncLayout = useEffectEvent(() => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setContainerWidth(rect.width);
    setScrollState({
      top: window.scrollY,
      height: window.innerHeight,
      containerTop: rect.top + window.scrollY,
    });
  });

  const scheduleLayoutSync = useEffectEvent(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      syncLayout();
    });
  });

  useEffect(() => {
    const columnChanged = previousColumnCountRef.current !== columnCount;
    const itemsShrank = items.length < previousItemCountRef.current;

    if (columnChanged || itemsShrank) {
      setRowHeights({});
    }

    previousColumnCountRef.current = columnCount;
    previousItemCountRef.current = items.length;
  }, [columnCount, items.length]);

  useEffect(() => {
    scheduleLayoutSync();

    const handleScroll = () => scheduleLayoutSync();
    const handleResize = () => scheduleLayoutSync();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => {
      scheduleLayoutSync();
    });

    const node = containerRef.current;
    if (node) {
      resizeObserver.observe(node);
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const updateRowHeight = (rowIndex: number, height: number) => {
    setRowHeights((current) => {
      if (Math.abs((current[rowIndex] ?? 0) - height) < 2) {
        return current;
      }
      return {
        ...current,
        [rowIndex]: height,
      };
    });
  };

  const visibleRange = useMemo(() => {
    if (rows.length === 0) {
      return { start: 0, end: -1 };
    }

    if (scrollState.height === 0) {
      return { start: 0, end: Math.min(rows.length - 1, 4) };
    }

    const overscan = Math.max(
      scrollState.height,
      estimateRowHeight(columnCount) * 2,
    );
    const viewportTop = scrollState.top - scrollState.containerTop;
    const viewportBottom = viewportTop + scrollState.height;
    const start = findFirstVisibleRow(metrics, viewportTop - overscan);
    const end = findLastVisibleRow(metrics, viewportBottom + overscan);

    return {
      start: Math.max(0, start),
      end: Math.min(rows.length - 1, end),
    };
  }, [columnCount, metrics, rows.length, scrollState]);

  return (
    <div ref={containerRef} className="relative">
      <div style={{ height: totalHeight }}>
        {rows
          .slice(visibleRange.start, visibleRange.end + 1)
          .map((row, visibleIndex) => {
            const rowIndex = visibleRange.start + visibleIndex;
            const metric = metrics[rowIndex];
            if (!metric) return null;

            return (
              <MeasuredRow
                key={`${columnCount}:${rowIndex}`}
                top={metric.top}
                rowIndex={rowIndex}
                onHeightChange={updateRowHeight}
              >
                <div
                  className="grid gap-x-6"
                  style={{
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  }}
                >
                  {row.map((item, columnIndex) =>
                    renderItem(item, rowIndex * columnCount + columnIndex),
                  )}
                </div>
              </MeasuredRow>
            );
          })}
      </div>
    </div>
  );
}

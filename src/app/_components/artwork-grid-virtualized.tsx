"use client";

import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";

type VirtualizedArtworkGridProps<TItem> = {
  items: TItem[];
  renderItem: (item: TItem, index: number) => ReactNode;
};

type RowMetric = {
  top: number;
  height: number;
  bottom: number;
};

type Range = {
  start: number;
  end: number;
};

type ScrollState = {
  top: number;
  height: number;
  containerTop: number;
};

const GRID_ROW_GAP = 48;
const RENDER_OVERSCAN_VIEWPORTS = 1.8;
const MIN_RENDER_OVERSCAN_ROWS = 3;

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
  isActive,
  top,
  rowIndex,
  onHeightChange,
}: {
  children: ReactNode;
  isActive: boolean;
  top: number;
  rowIndex: number;
  onHeightChange: (rowIndex: number, height: number) => void;
}) {
  const reduce = useReducedMotion();
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
    <motion.div
      ref={rowRef}
      className="absolute inset-x-0"
      style={{
        top,
        willChange: reduce ? undefined : "opacity, transform",
      }}
      initial={reduce ? false : { opacity: 0, y: 10, scale: 0.995 }}
      animate={
        reduce
          ? false
          : {
              opacity: isActive ? 1 : 0.28,
              y: isActive ? 0 : 8,
              scale: isActive ? 1 : 0.995,
            }
      }
      transition={{
        duration: reduce ? 0 : 0.22,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

function useVirtualizedGridLayout(itemCount: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousColumnCountRef = useRef(1);
  const previousItemCountRef = useRef(itemCount);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollState, setScrollState] = useState<ScrollState>({
    top: 0,
    height: 0,
    containerTop: 0,
  });
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});

  const columnCount = columnCountForWidth(containerWidth);

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
    const itemsShrank = itemCount < previousItemCountRef.current;

    if (columnChanged || itemsShrank) {
      setRowHeights({});
    }

    previousColumnCountRef.current = columnCount;
    previousItemCountRef.current = itemCount;
  }, [columnCount, itemCount]);

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

  return {
    columnCount,
    containerRef,
    rowHeights,
    scrollState,
    updateRowHeight,
  };
}

function useVirtualizedRanges(args: {
  columnCount: number;
  rowHeights: Record<number, number>;
  rowCount: number;
  scrollState: ScrollState;
}) {
  const { columnCount, rowHeights, rowCount, scrollState } = args;
  const { metrics, totalHeight } = useMemo(
    () => buildRowMetrics(rowCount, rowHeights, columnCount),
    [columnCount, rowCount, rowHeights],
  );

  const visibleRange = useMemo<Range>(() => {
    if (rowCount === 0) {
      return { start: 0, end: -1 };
    }

    if (scrollState.height === 0) {
      return { start: 0, end: Math.min(rowCount - 1, 4) };
    }

    const overscan = Math.max(
      scrollState.height,
      estimateRowHeight(columnCount) * 2,
    );
    const viewportTop = scrollState.top - scrollState.containerTop;
    const viewportBottom = viewportTop + scrollState.height;

    return {
      start: Math.max(0, findFirstVisibleRow(metrics, viewportTop - overscan)),
      end: Math.min(
        rowCount - 1,
        findLastVisibleRow(metrics, viewportBottom + overscan),
      ),
    };
  }, [columnCount, metrics, rowCount, scrollState]);

  const renderRange = useMemo<Range>(() => {
    if (rowCount === 0) {
      return { start: 0, end: -1 };
    }

    if (scrollState.height === 0) {
      return { start: 0, end: Math.min(rowCount - 1, 6) };
    }

    const rowHeight = estimateRowHeight(columnCount);
    const renderOverscan = Math.max(
      scrollState.height * RENDER_OVERSCAN_VIEWPORTS,
      rowHeight * MIN_RENDER_OVERSCAN_ROWS,
    );
    const viewportTop = scrollState.top - scrollState.containerTop;
    const viewportBottom = viewportTop + scrollState.height;

    return {
      start: Math.max(
        0,
        findFirstVisibleRow(metrics, viewportTop - renderOverscan),
      ),
      end: Math.min(
        rowCount - 1,
        findLastVisibleRow(metrics, viewportBottom + renderOverscan),
      ),
    };
  }, [columnCount, metrics, rowCount, scrollState]);

  return { metrics, renderRange, totalHeight, visibleRange };
}

export function VirtualizedArtworkGrid<TItem>({
  items,
  renderItem,
}: VirtualizedArtworkGridProps<TItem>) {
  const reduce = useReducedMotion();
  const {
    columnCount,
    containerRef,
    rowHeights,
    scrollState,
    updateRowHeight,
  } = useVirtualizedGridLayout(items.length);
  const rows = useMemo(
    () => chunkIntoRows(items, columnCount),
    [columnCount, items],
  );
  const { metrics, renderRange, totalHeight, visibleRange } =
    useVirtualizedRanges({
      columnCount,
      rowHeights,
      rowCount: rows.length,
      scrollState,
    });

  return (
    <div ref={containerRef} className="relative">
      <div style={{ height: totalHeight }}>
        {rows
          .slice(renderRange.start, renderRange.end + 1)
          .map((row, visibleIndex) => {
            const rowIndex = renderRange.start + visibleIndex;
            const metric = metrics[rowIndex];
            if (!metric) return null;
            const isActive =
              rowIndex >= visibleRange.start && rowIndex <= visibleRange.end;

            return (
              <MeasuredRow
                key={`${columnCount}:${rowIndex}`}
                isActive={reduce ? true : isActive}
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

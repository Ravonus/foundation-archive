"use client";

import { usePathname } from "next/navigation";
import { Children, isValidElement, useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

type FadeUpProps = {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
  inView?: boolean;
  as?: "div" | "section" | "span" | "p" | "h1" | "h2";
};

export function FadeUp({
  children,
  delay = 0,
  y = 12,
  duration = 0.6,
  className,
  inView = false,
  as = "div",
}: FadeUpProps) {
  const reduce = useReducedMotion();
  const offset = reduce ? 0 : y;
  const Tag = motion[as] as React.ComponentType<HTMLMotionProps<"div">>;

  const base = {
    initial: { opacity: 0, y: offset },
    transition: { duration, delay, ease: EASE },
    className,
  } as const;

  if (inView) {
    return (
      <Tag
        {...base}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
      >
        {children}
      </Tag>
    );
  }

  return (
    <Tag {...base} animate={{ opacity: 1, y: 0 }}>
      {children}
    </Tag>
  );
}

type StaggerProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  y?: number;
  duration?: number;
  inView?: boolean;
};

export function Stagger({
  children,
  className,
  delay = 0,
  stagger = 0.07,
  y = 14,
  duration = 0.55,
  inView = true,
}: StaggerProps) {
  const reduce = useReducedMotion();
  const parent: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduce ? 0 : stagger,
        delayChildren: delay,
      },
    },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : y },
    visible: { opacity: 1, y: 0, transition: { duration, ease: EASE } },
  };

  const nodes = Children.toArray(children).filter((c) => isValidElement(c));

  return (
    <motion.div
      className={className}
      variants={parent}
      initial="hidden"
      {...(inView
        ? {
            whileInView: "visible",
            viewport: { once: true, margin: "-60px" },
          }
        : { animate: "visible" })}
    >
      {nodes.map((child, index) => (
        <motion.div
          key={(isValidElement(child) ? child.key : undefined) ?? index}
          variants={item}
          className="contents"
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

export function WordReveal({
  text,
  className,
  delay = 0,
  stagger = 0.045,
  duration = 0.7,
  as = "h1",
  highlight,
  highlightClassName = "font-semibold text-[var(--color-brand-green)]",
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
  as?: "h1" | "h2" | "p";
  highlight?: string;
  highlightClassName?: string;
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as] as React.ComponentType<HTMLMotionProps<"h1">>;
  const normalized = highlight?.trim().toLowerCase();
  const isHighlighted = (token: string) =>
    Boolean(normalized) && token.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase() === normalized;

  if (reduce) {
    const Plain = as;
    return (
      <Plain className={className}>
        {text.split("\n").map((line, li, arr) => (
          <span key={li} style={{ display: "block" }}>
            {line.split(/(\s+)/).map((token, i) => {
              if (/^\s+$/.test(token)) return token;
              return isHighlighted(token) ? (
                <span key={`${li}-${i}`} className={highlightClassName}>
                  {token}
                </span>
              ) : (
                token
              );
            })}
            {li < arr.length - 1 ? null : null}
          </span>
        ))}
      </Plain>
    );
  }

  const parent: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren: delay },
    },
  };
  const child: Variants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration, ease: EASE } },
  };

  const lines = text.split("\n");

  return (
    <Tag
      className={className}
      variants={parent}
      initial="hidden"
      animate="visible"
    >
      {lines.map((line, li) => (
        <span key={li} style={{ display: "block" }}>
          {line.split(/(\s+)/).map((token, i) => {
            if (/^\s+$/.test(token)) return token;
            return (
              <motion.span
                key={`${li}-${i}`}
                variants={child}
                className={isHighlighted(token) ? highlightClassName : undefined}
                style={{ display: "inline-block" }}
              >
                {token}
              </motion.span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}

export function CountUp({
  value,
  duration = 1200,
}: {
  value: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  const displayValue = reduce ? value : n;

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      start ??= ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);

  return (
    <span className="tabular-nums" aria-label={value.toLocaleString()}>
      {displayValue.toLocaleString()}
    </span>
  );
}

export function BlurImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className={className}
      style={{
        display: "block",
        maxWidth: "100%",
        filter: reduce || loaded ? "blur(0px)" : "blur(10px)",
        opacity: reduce || loaded ? 1 : 0.6,
        transition: "filter 700ms cubic-bezier(0.16, 1, 0.3, 1), opacity 700ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    />
  );
}

export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

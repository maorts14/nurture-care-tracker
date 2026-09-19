import { ReactNode, useEffect, useRef } from "react";

type ModalBackdropProps = {
  children: ReactNode;
  onClose: () => void;
};

let activeModalLocks = 0;
let savedScrollTop = 0;
let savedStyles: Record<string, string> | null = null;

function useModalScrollLock() {
  useEffect(() => {
    if (activeModalLocks === 0) {
      const root = document.documentElement;
      const body = document.body;
      savedScrollTop = window.scrollY;
      savedStyles = {
        rootOverflow: root.style.overflow,
        rootOverscrollBehavior: root.style.overscrollBehavior,
        bodyOverflow: body.style.overflow,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyWidth: body.style.width,
      };
      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${savedScrollTop}px`;
      body.style.width = "100%";
    }
    activeModalLocks += 1;

    return () => {
      activeModalLocks -= 1;
      if (activeModalLocks !== 0 || !savedStyles) return;
      const root = document.documentElement;
      const body = document.body;
      root.style.overflow = savedStyles.rootOverflow;
      root.style.overscrollBehavior = savedStyles.rootOverscrollBehavior;
      body.style.overflow = savedStyles.bodyOverflow;
      body.style.position = savedStyles.bodyPosition;
      body.style.top = savedStyles.bodyTop;
      body.style.width = savedStyles.bodyWidth;
      window.scrollTo(0, savedScrollTop);
      savedStyles = null;
    };
  }, []);
}

export function ModalBackdrop({ children, onClose }: ModalBackdropProps) {
  useModalScrollLock();
  const backdropRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusable = () => Array.from(
      backdropRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const initialFocus = backdropRef.current?.querySelector<HTMLElement>("[autofocus]") ?? focusable()[0];
    requestAnimationFrame(() => initialFocus?.focus());

    return () => {
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, []);

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {children}
    </div>
  );
}

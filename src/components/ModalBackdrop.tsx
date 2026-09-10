import { ReactNode, useEffect } from "react";

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
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

import { ReactNode } from "react";

type ModalBackdropProps = {
  children: ReactNode;
  onClose: () => void;
};

export function ModalBackdrop({ children, onClose }: ModalBackdropProps) {
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

"use client";

// Pulsante di submit che chiede conferma prima di inviare il form (es. eliminazione definitiva).
export default function BottoneConferma({
  messaggio,
  className,
  children,
}: {
  messaggio: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(messaggio)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

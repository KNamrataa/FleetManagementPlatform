import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "./StatusFilterDropdown.css";
export default function StatusFilterDropdown({
  value,
  onChange,
  options = [],
  ariaLabel = "Filter by status",
}) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});

  const selectedLabel = value
    ? String(value).replaceAll("_", " ")
    : "All statuses";

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalPadding = 8;
    const gap = 6;
    const width = Math.min(
      Math.max(rect.width, 180),
      viewportWidth - horizontalPadding * 2
    );
    const left = Math.min(
      Math.max(rect.left, horizontalPadding),
      viewportWidth - width - horizontalPadding
    );
    const maxHeight = Math.max(
      180,
      Math.min(360, viewportHeight - horizontalPadding * 2)
    );

    const spaceBelow = viewportHeight - rect.bottom - gap - horizontalPadding;
    const spaceAbove = rect.top - gap - horizontalPadding;
    const openAbove = spaceBelow < Math.min(maxHeight, 240) && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      80,
      Math.min(maxHeight, openAbove ? spaceAbove : spaceBelow)
    );

    setMenuStyle({
      position: "fixed",
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${availableHeight}px`,
      ...(openAbove
        ? { bottom: `${Math.max(viewportHeight - rect.top + gap, horizontalPadding)}px` }
        : { top: `${Math.min(rect.bottom + gap, viewportHeight - horizontalPadding)}px` }),
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    updatePosition();

    const handlePointerDown = (event) => {
      if (
        triggerRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleViewportChange = () => updatePosition();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  const selectOption = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setOpen((current) => !current);
    }
  };

  const allOptions = ["", ...options];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sa-status-filter-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedLabel}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={open ? "sa-status-filter-chevron open" : "sa-status-filter-chevron"}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="sa-status-filter-menu"
            style={menuStyle}
            role="listbox"
            aria-label={ariaLabel}
          >
            {allOptions.map((option) => {
              const label = option
                ? String(option).replaceAll("_", " ")
                : "All statuses";
              const selected = value === option;

              return (
                <button
                  key={option || "all"}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={
                    selected
                      ? "sa-status-filter-option selected"
                      : "sa-status-filter-option"
                  }
                  onClick={() => selectOption(option)}
                >
                  <span>{label}</span>
                  {selected && <Check size={16} aria-hidden="true" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

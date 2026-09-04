// Tiny client-side bridge: any component can open the license modal.
// The modal component itself subscribes on mount.

type ModalListener = (open: boolean) => void;

let modalListener: ModalListener | null = null;

export function openLicenseModal() {
  modalListener?.(true);
}

export function closeLicenseModal() {
  modalListener?.(false);
}

export function setLicenseModalListener(listener: ModalListener | null) {
  modalListener = listener;
}

/** Fired on window after a license is successfully activated. */
export const LICENSE_ACTIVATED_EVENT = "ctube:license-activated";

export function dispatchLicenseActivated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LICENSE_ACTIVATED_EVENT));
  }
}
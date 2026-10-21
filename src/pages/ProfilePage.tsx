import { useRef, useState } from "react";
import { Bell, Camera, Check, ChevronRight, LockKeyhole, Mail, ShieldCheck, UserRound, X } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest, getProfilePhotoUrl } from "../lib/api";
import { supabase } from "../lib/supabase";
import { roleLabel } from "../lib/roles";
import PageHeading from "../components/PageHeading";
import { useToast } from "../components/ToastProvider";
import "../css/ProfilePage.css";
import "../css/OperationsPages.css";

interface ProfileUpdateResponse {
  displayName: string | null;
  avatarPath: string | null;
  message: string;
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("We couldn't read that image."));
    };
    reader.onerror = () => reject(new Error("We couldn't read that image."));
    reader.readAsDataURL(file);
  });
}

interface CropOffset {
  x: number;
  y: number;
}

function clampCropOffset(image: HTMLImageElement, viewportSize: number, zoom: number, offset: CropOffset): CropOffset {
  if (!image.naturalWidth || !image.naturalHeight || !viewportSize) return { x: 0, y: 0 };
  const scale = viewportSize / Math.min(image.naturalWidth, image.naturalHeight);
  const maxX = Math.max(0, (image.naturalWidth * scale * zoom - viewportSize) / 2);
  const maxY = Math.max(0, (image.naturalHeight * scale * zoom - viewportSize) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

function makeSquareCrop(image: HTMLImageElement, zoom: number, offset: CropOffset, viewportSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const size = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const previewScale = viewportSize / Math.min(image.naturalWidth, image.naturalHeight);
    const centerX = image.naturalWidth / 2 - offset.x / (previewScale * zoom);
    const centerY = image.naturalHeight / 2 - offset.y / (previewScale * zoom);
    const left = Math.min(image.naturalWidth - size, Math.max(0, centerX - size / 2));
    const top = Math.min(image.naturalHeight - size, Math.max(0, centerY - size / 2));
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Image cropping is unavailable in this browser."));
      return;
    }
    context.drawImage(image, left, top, size, size, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("We couldn't prepare the cropped profile photo."));
    }, "image/jpeg", 0.9);
  });
}

export default function ProfilePage({
  user,
  onRequestPasswordReset,
  onUserUpdated,
  onNavigate,
}: {
  user: CurrentUser;
  onRequestPasswordReset: (email: string) => Promise<void>;
  onUserUpdated: (user: CurrentUser) => void;
  onNavigate: (section: "Notifications") => void;
}) {
  const { showToast } = useToast();
  const [resetBusy, setResetBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const cropViewport = useRef<HTMLDivElement>(null);
  const cropImage = useRef<HTMLImageElement>(null);
  const cropDrag = useRef<{ pointerId: number; clientX: number; clientY: number; offset: CropOffset } | null>(null);
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "Flex Bar user";
  const photoUrl = getProfilePhotoUrl(user.avatarPath);

  async function requestPasswordReset() {
    if (!user.email) {
      showToast("No email address is available for this account. Please contact your administrator.", "error");
      return;
    }
    setResetBusy(true);
    try {
      await onRequestPasswordReset(user.email);
      showToast("If an account exists for that email, a password reset link has been sent.", "success");
    } catch {
      showToast("We couldn't send the reset link. Please try again or contact your administrator.", "error");
    } finally {
      setResetBusy(false);
    }
  }

  async function saveName() {
    const nextName = displayName.trim();
    if (nextName.length < 2 || nextName.length > 100) {
      showToast("Your display name must be between 2 and 100 characters.", "error");
      return;
    }
    setSaveBusy(true);
    try {
      const result = await apiRequest<ProfileUpdateResponse>("/api/v1/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: nextName }),
      });
      onUserUpdated({ ...user, displayName: result.displayName });
      setEditingName(false);
      showToast("Your profile name has been updated.", "success");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't update your profile name.", "error");
    } finally {
      setSaveBusy(false);
    }
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("Choose a JPG, PNG, or WebP image.", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("Choose an image smaller than 8 MB.", "error");
      return;
    }
    try {
      setCropSource(await readImageFile(file));
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
    } catch {
      showToast("We couldn't open that image. Please choose another file.", "error");
    }
  }

  async function uploadPhoto() {
    if (!supabase || !cropImage.current) {
      showToast("Profile photo storage is unavailable. Please try again later.", "error");
      return;
    }
    setUploadBusy(true);
    try {
      const croppedPhoto = await makeSquareCrop(
        cropImage.current,
        cropZoom,
        cropOffset,
        cropViewport.current?.clientWidth ?? 300,
      );
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(path, croppedPhoto, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw new Error("We couldn't upload your profile photo. Please try again.");

      let profile: ProfileUpdateResponse;
      try {
        profile = await apiRequest<ProfileUpdateResponse>("/api/v1/profile", {
          method: "PATCH",
          body: JSON.stringify({ avatarPath: path }),
        });
      } catch (error: unknown) {
        const { error: cleanupError } = await supabase.storage.from("profile-photos").remove([path]);
        if (cleanupError) console.error("Could not clean up an unlinked profile photo.", cleanupError);
        throw error;
      }
      onUserUpdated({ ...user, avatarPath: profile.avatarPath });
      setCropSource(null);
      showToast("Your profile photo has been updated.", "success");
      if (user.avatarPath) {
        const { error: cleanupError } = await supabase.storage.from("profile-photos").remove([user.avatarPath]);
        if (cleanupError) {
          console.error("Could not remove the previous profile photo.", cleanupError);
          showToast("Your new photo is saved, but the previous photo could not be removed.", "error");
        }
      }
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't update your profile photo.", "error");
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="My Profile" description="Your Flex Bar account information and security." />
      <div className="surface-card profile-card">
        <button className="profile-avatar profile-avatar--button" onClick={() => fileInput.current?.click()} aria-label="Change profile photo">
          {photoUrl ? <img src={photoUrl} alt="" /> : <UserRound size={29} />}
          <span className="profile-avatar__camera"><Camera size={15} /></span>
        </button>
        <input ref={fileInput} className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void choosePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
        <h2>{name}</h2>
        <p>{roleLabel(user.role)}</p>
        <span className="status-pill"><ShieldCheck size={12} /> Active account</span>
        <div className="profile-data-grid">
          <div><small>Email address</small><strong><Mail size={14} />{user.email ?? "Not available"}</strong></div>
          <div><small>Assigned role</small><strong><LockKeyhole size={14} />{roleLabel(user.role)}</strong></div>
        </div>
      </div>
      <div className="surface-card settings-list">
        <button className="settings-row" onClick={() => { setDisplayName(user.displayName ?? ""); setEditingName((current) => !current); }}><span className="settings-row__icon"><UserRound size={17} /></span><span><strong>Account information</strong><small>Update your display name and profile photo</small></span><ChevronRight size={16} /></button>
        {editingName && <div className="profile-edit-form"><label>Display name<input value={displayName} maxLength={100} onChange={(event) => setDisplayName(event.target.value)} /></label><div className="toolbar-row"><button className="button button--outline" onClick={() => setEditingName(false)}>Cancel</button><button className="button button--primary" onClick={() => void saveName()} disabled={saveBusy}><Check size={15} />{saveBusy ? "Saving…" : "Save name"}</button></div></div>}
        <button className="settings-row" onClick={() => void requestPasswordReset()} disabled={resetBusy}><span className="settings-row__icon"><LockKeyhole size={17} /></span><span><strong>Change password</strong><small>{resetBusy ? "Sending reset link…" : "Send a secure password reset link"}</small></span><ChevronRight size={16} /></button>
        <button className="settings-row" onClick={() => onNavigate("Notifications")}><span className="settings-row__icon"><Bell size={17} /></span><span><strong>Notifications</strong><small>Manage workspace notification settings</small></span><ChevronRight size={16} /></button>
      </div>

      {cropSource && (
        <div className="profile-crop-backdrop">
          <section className="profile-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-crop-title">
            <div className="profile-crop-dialog__header"><div><h2 id="profile-crop-title">Crop profile photo</h2><p>Adjust the square crop so your face is centered.</p></div><button className="icon-button" onClick={() => setCropSource(null)} aria-label="Close photo crop"><X size={19} /></button></div>
            <div
              ref={cropViewport}
              className="profile-crop-window"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                cropDrag.current = {
                  pointerId: event.pointerId,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  offset: cropOffset,
                };
              }}
              onPointerMove={(event) => {
                const drag = cropDrag.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                const nextOffset = clampCropOffset(
                  cropImage.current!,
                  event.currentTarget.clientWidth,
                  cropZoom,
                  {
                    x: drag.offset.x + event.clientX - drag.clientX,
                    y: drag.offset.y + event.clientY - drag.clientY,
                  },
                );
                setCropOffset(nextOffset);
              }}
              onPointerUp={(event) => {
                if (cropDrag.current?.pointerId !== event.pointerId) return;
                cropDrag.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => { cropDrag.current = null; }}
            >
              <img
                ref={cropImage}
                src={cropSource}
                alt="Photo crop preview. Drag to position your face."
                draggable={false}
                onLoad={() => setCropOffset((offset) => clampCropOffset(cropImage.current!, cropViewport.current?.clientWidth ?? 300, cropZoom, offset))}
                style={{ transform: `scale(${cropZoom}) translate(${cropOffset.x / cropZoom}px, ${cropOffset.y / cropZoom}px)` }}
              />
            </div>
            <p className="profile-crop-hint">Drag the photo to center your face, then adjust the zoom.</p>
            <label className="profile-crop-zoom">Zoom<input type="range" min="1" max="3" step="0.05" value={cropZoom} onChange={(event) => {
              const zoom = Number(event.target.value);
              setCropZoom(zoom);
              if (cropImage.current && cropViewport.current) {
                setCropOffset((offset) => clampCropOffset(cropImage.current!, cropViewport.current!.clientWidth, zoom, offset));
              }
            }} /></label>
            <div className="toolbar-row"><button className="button button--outline" onClick={() => setCropSource(null)} disabled={uploadBusy}>Cancel</button><button className="button button--primary" onClick={() => void uploadPhoto()} disabled={uploadBusy}><Camera size={15} />{uploadBusy ? "Saving photo…" : "Use cropped photo"}</button></div>
          </section>
        </div>
      )}
    </section>
  );
}

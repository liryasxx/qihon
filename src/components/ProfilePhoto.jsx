import { useEffect, useRef, useState } from 'react';
import { supabase, useApp } from '../lib/state';
import Icon from './Icon';

export default function ProfilePhoto() {
  const { user, notify } = useApp();
  const input = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);

  const avatarPath =
    typeof user?.user_metadata?.avatar_path === 'string'
      ? user.user_metadata.avatar_path
      : '';

  const photoUrl =
    photo?.userId === user?.id && photo?.path === avatarPath
      ? photo.url
      : '';

  useEffect(() => {
    let active = true;
    setPhoto(null);

    if (!supabase || !user || !avatarPath.startsWith(`${user.id}/`)) {
      return;
    }

    async function loadPhoto() {
      try {
        const { data, error } = await supabase.storage
          .from('avatars')
          .createSignedUrl(avatarPath, 3600);

        if (!error && active) {
          setPhoto({
            userId: user.id,
            path: avatarPath,
            url: data.signedUrl,
          });
        }
      } catch {
        // Show the account initial if the image cannot load.
      }
    }

    loadPhoto();

    const timer = setInterval(loadPhoto, 50 * 60 * 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user?.id, avatarPath]);

  async function changePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !user || !supabase || uploading) return;

    const types = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    if (!types[file.type]) {
      return notify('Choose a JPG, PNG, or WebP image.');
    }

    if (!file.size || file.size > 2 * 1024 * 1024) {
      return notify('Choose an image smaller than 2 MB.');
    }

    setUploading(true);

    try {
      const path =
        `${user.id}/${crypto.randomUUID()}.${types[file.type]}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase.auth.updateUser({
        data: { avatar_path: path },
      });

      if (profileError) {
        await supabase.storage
          .from('avatars')
          .remove([path])
          .catch(() => {});

        throw profileError;
      }

      if (avatarPath.startsWith(`${user.id}/`)) {
        await supabase.storage
          .from('avatars')
          .remove([avatarPath])
          .catch(() => {});
      }

      notify('Profile picture updated.');
    } catch (error) {
      notify(error.message || 'Could not upload your photo. Try again.');
    } finally {
      setUploading(false);
    }
  }

  const initial = (
    user?.user_metadata?.display_name ||
    user?.email ||
    'R'
  ).slice(0, 1).toUpperCase();

    return (
    <div className="profile-photo">
      <button
        type="button"
        className="avatar-edit"
        disabled={!user || uploading}
        onClick={() => input.current?.click()}
        aria-label={user ? 'Change profile photo' : 'Profile avatar'}
        aria-busy={uploading}
        aria-describedby={user ? 'profile-photo-help' : undefined}
      >
        <span className="profile-avatar">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              onError={() => setPhoto(null)}
            />
          ) : user ? (
            initial
          ) : (
            <Icon name="user" size={35} />
          )}
        </span>

        {user && (
          <span className="avatar-camera" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
        )}
      </button>

      {user && (
        <>
          <input
            ref={input}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a profile picture"
            onChange={changePhoto}
          />

          <span
            id="profile-photo-help"
            className="avatar-hint"
            role="status"
          >
            {uploading
              ? 'Uploading photo…'
              : 'JPG, PNG, or WebP · Up to 2 MB'}
          </span>
        </>
      )}
    </div>
  );
}
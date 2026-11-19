import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, useApp } from '../lib/state';
import Icon from './Icon';

export default function HeaderAvatar() {
  const { user } = useApp();
  const [photo, setPhoto] = useState(null);
  const userId = user?.id;

  const avatarPath =
    typeof user?.user_metadata?.avatar_path === 'string'
      ? user.user_metadata.avatar_path
      : '';

  useEffect(() => {
    let active = true;
    setPhoto(null);

    if (
      !supabase ||
      !userId ||
      !avatarPath.startsWith(`${userId}/`)
    ) return;

    async function loadPhoto() {
      try {
        const { data, error } = await supabase.storage
          .from('avatars')
          .createSignedUrl(avatarPath, 3600);

        if (active) {
          setPhoto(
            !error && data?.signedUrl
              ? { userId, path: avatarPath, url: data.signedUrl }
              : null
          );
        }
      } catch {
        if (active) setPhoto(null);
      }
    }

    loadPhoto();

    const timer = setInterval(loadPhoto, 50 * 60 * 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId, avatarPath]);

  const photoUrl =
    photo && photo.userId === userId && photo.path === avatarPath
      ? photo.url
      : '';

  const displayName = user?.user_metadata?.display_name;
  const name =
    typeof displayName === 'string'
      ? displayName
      : user?.email || 'R';

  const initial = name.trim().slice(0, 1).toUpperCase() || 'R';

  return (
    <Link
      className="avatar header-avatar"
      to="/profile"
      aria-label={user ? 'Open your profile' : 'Open profile and sign in'}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          onError={() => setPhoto(null)}
        />
      ) : user ? (
        initial
      ) : (
        <Icon name="user" size={19} />
      )}
    </Link>
  );
}
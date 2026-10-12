import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import {
  countMobileSouthLandscapeNameChars,
  getMobileSouthLandscapeNameFontPx,
} from './mobileSouthLandscapeNameLayout';
import { USER_SOUTH_NAME_PLAY_PLAQUE_MAX_MOBILE_LANDSCAPE_PX } from './userSouthPanelCanon';
import { UserSouthMobileNamePlaque } from './UserSouthMobileNamePlaque';

type MobileSouthLandscapePlayerNameProps = {
  name: string;
  chatBody: string | null;
  chatKey: number;
  nameClassName: string;
  baseNameStyle: CSSProperties;
  title: string;
  /** ~9% меньше при >4 заглавных в исходном имени (см. playerDisplayNameFormat). */
  fontScale?: number;
};

/**
 * Моб. landscape · Юг: одна строка в узкой панели.
 * Компактный кегль + clamp 132px + cosmic fade/scroll (как портрет, без «…» и без two-line).
 */
export function MobileSouthLandscapePlayerName({
  name,
  chatBody,
  chatKey,
  nameClassName,
  baseNameStyle,
  title,
  fontScale = 1,
}: MobileSouthLandscapePlayerNameProps) {
  const charCount = countMobileSouthLandscapeNameChars(name);
  const fontPx = getMobileSouthLandscapeNameFontPx(charCount) * fontScale;
  const nameStyle = useMemo(
    () => ({
      ...baseNameStyle,
      fontSize: fontPx,
      lineHeight: 1,
    }),
    [baseNameStyle, fontPx],
  );

  return (
    <UserSouthMobileNamePlaque
      name={name}
      chatBody={chatBody}
      chatKey={chatKey}
      nameClassName={nameClassName}
      nameStyle={nameStyle}
      title={title}
      maxWidthPx={USER_SOUTH_NAME_PLAY_PLAQUE_MAX_MOBILE_LANDSCAPE_PX}
      plaqueClassName="user-south-mobile-name-plaque--landscape"
      styleVars={{ ['--south-ls-name-font' as string]: `${fontPx}px` }}
    />
  );
}

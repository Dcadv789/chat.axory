import type { SVGProps } from 'react';

export function ZappfyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 50 45" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M9.476 36.599s-2.672.057-4.005-.012C2.239 36.42.083 34.344.055 31.096c-.073-8.511-.073-17.025 0-25.536C.083 2.18 2.269.052 5.7.039 18.439-.012 31.18-.014 43.917.039c3.517.013 5.634 2.215 5.657 5.793.053 8.333.053 16.665-.006 24.998-.028 3.684-2.186 5.739-5.971 5.762-7.8.043-15.599.014-23.428.014-2.092 4.831-5.368 8.383-10.557 8.394-1.706.005-2.922-.417-2.922-.417s2.916-1.322 3.925-3.615c1.202-2.731.454-4.351.454-4.351l-1.594-.018Z"
        fill="url(#zappfy_grad)"
      />
      <path
        d="M27.828 11.226h-8.823a4.226 4.226 0 0 1-4.228-4.223h20.331v4.223L21.655 24.896h9.327a4.226 4.226 0 0 1 4.228 4.223H14.41v-4.223l13.419-13.67Z"
        fill="#171D18"
      />
      <defs>
        <linearGradient id="zappfy_grad" x1="-10.158" y1="43.912" x2="51.345" y2="-1.247" gradientUnits="userSpaceOnUse">
          <stop stopColor="#51C26F" />
          <stop offset="1" stopColor="#F2E901" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function MetaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        fill="url(#meta_grad)"
        d="M18 1L21.62 4.48L26.5 3.28L27.9 8.1L32.72 9.5L31.52 14.38L35 18L31.52 21.62L32.72 26.5L27.9 27.9L26.5 32.72L21.62 31.52L18 35L14.38 31.52L9.5 32.72L8.1 27.9L3.28 26.5L4.48 21.62L1 18L4.48 14.38L3.28 9.5L8.1 8.1L9.5 3.28L14.38 4.48Z"
      />
      <path
        d="M11.5 18.5L16 23L25 13.5"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <defs>
        <linearGradient id="meta_grad" x1="18" y1="1" x2="18" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1FB1FF" />
          <stop offset="1" stopColor="#0066E1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="18" cy="18" r="18" fill="url(#ig_grad)" />
      <rect x="9.5" y="9.5" width="17" height="17" rx="5" stroke="white" strokeWidth="2.6" fill="none" />
      <circle cx="18" cy="18" r="4.4" stroke="white" strokeWidth="2.6" fill="none" />
      <circle cx="23.2" cy="12.8" r="1.15" fill="white" />
      <defs>
        <radialGradient id="ig_grad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(7 38) rotate(-55) scale(48)">
          <stop stopColor="#FFD600" />
          <stop offset="0.25" stopColor="#FF7A00" />
          <stop offset="0.55" stopColor="#FF137C" />
          <stop offset="0.85" stopColor="#A02DAA" />
          <stop offset="1" stopColor="#5851DB" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * Threads. Mesmo formato dos outros ícones de canal: disco de 36px com o glifo
 * vazado, pra alinhar com Instagram/Telegram na lista de canais.
 */
export function ThreadsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="18" cy="18" r="18" fill="#000000" />
      <g transform="translate(6 6) scale(1)">
        <path
          fill="#FFFFFF"
          d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.056 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221Z"
        />
      </g>
    </svg>
  );
}

export function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="18" cy="18" r="18" fill="#2AABEE" />
      <path
        d="M27.1 10.2 8.7 17.3c-1.25.5-1.24 1.2-.23 1.5l4.72 1.47 1.8 5.55c.23.65.12.9.78.9.5 0 .72-.23 1-.5l2.4-2.34 4.99 3.68c.92.5 1.58.24 1.8-.85l3.28-15.44c.34-1.35-.52-1.96-1.84-1.07Z"
        fill="white"
      />
      <path
        d="m13.55 19.92 10.8-6.82c.51-.31.98-.14.6.2l-8.74 7.9-.34 3.6-1.66-5.12-.66.24Z"
        fill="#C8DAEA"
      />
    </svg>
  );
}

import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export function QRCode({ value, size = 150, className = "" }: QRCodeProps) {
  return (
    <div className={`inline-block ${className}`}>
      <QRCodeSVG value={value} size={size} level="M" />
    </div>
  );
}

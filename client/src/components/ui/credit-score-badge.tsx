import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface CreditScoreBadgeProps {
  creditScore: number;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const CreditScoreBadge: React.FC<CreditScoreBadgeProps> = ({
  creditScore,
  showIcon = true,
  size = 'md'
}) => {
  // Credit score is now stored as direct value (0-850)
  const displayScore = Math.round(creditScore);

  // Determine semantic token and status based on credit score (0-850 range)
  const getCreditScoreInfo = (score: number) => {
    const displayValue = Math.round(score);
    if (displayValue >= 680) { // 80% of 850
      return {
        classes: 'bg-success text-success-foreground',
        status: 'Excellent',
        icon: <TrendingUp size={14} />
      };
    } else if (displayValue >= 595) { // 70% of 850
      return {
        classes: 'bg-info text-info-foreground',
        status: 'Good',
        icon: <TrendingUp size={14} />
      };
    } else if (displayValue >= 510) { // 60% of 850
      return {
        classes: 'bg-warning text-warning-foreground',
        status: 'Fair',
        icon: <Minus size={14} />
      };
    } else if (displayValue >= 425) { // 50% of 850
      return {
        classes: 'bg-danger/80 text-danger-foreground',
        status: 'Poor',
        icon: <TrendingDown size={14} />
      };
    } else {
      return {
        classes: 'bg-danger text-danger-foreground',
        status: 'Very Poor',
        icon: <TrendingDown size={14} />
      };
    }
  };

  const creditInfo = getCreditScoreInfo(creditScore);

  const sizeClasses = {
    sm: 'text-xs px-2 py-1 rounded-md gap-1',
    md: 'text-sm px-3 py-1.5 rounded-lg gap-1',
    lg: 'text-base px-4 py-2 rounded-lg gap-1.5',
  };

  return (
    <div
      className={`inline-flex items-center font-medium border-0 shadow-sm select-none ${creditInfo.classes} ${sizeClasses[size]}`}
    >
      {showIcon && creditInfo.icon}
      <span className="font-semibold">{creditInfo.status}</span>
      <span className="font-bold ml-1">({displayScore})</span>
    </div>
  );
};

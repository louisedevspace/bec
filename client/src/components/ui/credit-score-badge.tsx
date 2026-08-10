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
  
  // Determine color and status based on credit score (0-850 range)
  const getCreditScoreInfo = (score: number) => {
    const displayValue = Math.round(score);
    if (displayValue >= 680) { // 80% of 850
      return {
        backgroundColor: '#10b981', // green-500
        color: '#ffffff',
        status: 'Excellent',
        icon: <TrendingUp size={14} />
      };
    } else if (displayValue >= 595) { // 70% of 850
      return {
        backgroundColor: '#3b82f6', // blue-500
        color: '#ffffff',
        status: 'Good',
        icon: <TrendingUp size={14} />
      };
    } else if (displayValue >= 510) { // 60% of 850
      return {
        backgroundColor: '#eab308', // yellow-500
        color: '#ffffff',
        status: 'Fair',
        icon: <Minus size={14} />
      };
    } else if (displayValue >= 425) { // 50% of 850
      return {
        backgroundColor: '#f97316', // orange-500
        color: '#ffffff',
        status: 'Poor',
        icon: <TrendingDown size={14} />
      };
    } else {
      return {
        backgroundColor: '#ef4444', // red-500
        color: '#ffffff',
        status: 'Very Poor',
        icon: <TrendingDown size={14} />
      };
    }
  };

  const creditInfo = getCreditScoreInfo(creditScore);
  
  const sizeStyles = {
    sm: {
      fontSize: '0.75rem',
      padding: '0.25rem 0.5rem',
      borderRadius: '0.375rem'
    },
    md: {
      fontSize: '0.875rem',
      padding: '0.375rem 0.75rem',
      borderRadius: '0.5rem'
    },
    lg: {
      fontSize: '1rem',
      padding: '0.5rem 1rem',
      borderRadius: '0.5rem'
    }
  };

  const badgeStyle = {
    ...sizeStyles[size],
    backgroundColor: creditInfo.backgroundColor,
    color: creditInfo.color,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontWeight: '500',
    border: 'none',
    cursor: 'default',
    userSelect: 'none' as const,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
  };

  return (
    <div style={badgeStyle}>
      {showIcon && creditInfo.icon}
      <span style={{ fontWeight: '600' }}>{creditInfo.status}</span>
      <span style={{ fontWeight: '700', marginLeft: '0.25rem' }}>({displayScore})</span>
    </div>
  );
};

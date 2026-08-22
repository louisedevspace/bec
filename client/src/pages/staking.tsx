import { useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { StakingModal } from '@/components/modals/staking-modal';

export default function StakingPage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();

  return (
    <StakingModal
      isOpen={true}
      onClose={() => setLocation('/')}
      userId={user?.id}
    />
  );
}

import { useRouter } from 'expo-router';

import { OnboardingStep } from '@/components/onboarding-step';
import { OptionList } from '@/components/ui/controls';
import { ACTIVITY_LEVELS } from '@/lib/targets';
import type { ActivityLevel } from '@/lib/types';
import { useOnboardingStore } from '@/store/onboarding';

/** ステップ3: 身体活動レベル */
export default function ActivityStep() {
  const router = useRouter();
  const { activityLevel, set } = useOnboardingStore();

  return (
    <OnboardingStep
      step={3}
      title="普段の活動量は？"
      description="消費カロリーの推定に使います。迷ったら、当てはまる説明が一番近いものを選んでください。"
      onNext={() => router.push('/onboarding/confirm')}
      nextDisabled={activityLevel == null}
      onBack={() => router.back()}>
      <OptionList<ActivityLevel>
        options={ACTIVITY_LEVELS.map((level) => ({
          value: level.level,
          label: level.label,
          description: level.example,
        }))}
        value={activityLevel}
        onChange={(value) => set({ activityLevel: value })}
      />
    </OnboardingStep>
  );
}

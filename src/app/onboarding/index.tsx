import { useRouter } from 'expo-router';

import { OnboardingStep } from '@/components/onboarding-step';
import { Field, NumberInput, SegmentedControl } from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { useOnboardingStore } from '@/store/onboarding';
import type { Gender } from '@/lib/types';

/** ステップ1: 基本情報 */
export default function BasicInfoStep() {
  const router = useRouter();
  const { gender, birthDate, heightCm, weightKg, set } = useOnboardingStore();

  const canProceed =
    gender != null && birthDate != null && Number(heightCm) > 0 && Number(weightKg) > 0;

  // 年齢の下限・上限（現実的な範囲に収めて入力ミスを防ぐ）
  const today = new Date();
  const minBirth = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
  const maxBirth = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());

  return (
    <OnboardingStep
      step={1}
      title="あなたのことを教えてください"
      description="目標カロリーを計算するために使います。あとから設定でいつでも変更できます。"
      onNext={() => router.push('/onboarding/goal')}
      nextDisabled={!canProceed}
    >
      <Field label="性別">
        <SegmentedControl<Gender>
          options={[
            { value: 'male', label: '男性' },
            { value: 'female', label: '女性' },
          ]}
          value={gender ?? 'male'}
          onChange={(value) => set({ gender: value })}
        />
      </Field>

      <Field label="生年月日" hint="年齢は自動で更新されます">
        <DateField
          value={birthDate}
          onChange={(value) => set({ birthDate: value })}
          minimumDate={minBirth}
          maximumDate={maxBirth}
        />
      </Field>

      <Field label="身長">
        <NumberInput
          value={heightCm}
          onChangeText={(value) => set({ heightCm: value })}
          unit="cm"
          placeholder="170"
        />
      </Field>

      <Field label="現在の体重">
        <NumberInput
          value={weightKg}
          onChangeText={(value) => set({ weightKg: value })}
          unit="kg"
          placeholder="65.0"
        />
      </Field>
    </OnboardingStep>
  );
}

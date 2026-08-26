import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  Field,
  NumberInput,
  SegmentedControl,
  TextField,
} from '@/components/ui/controls';
import { Card, CardTitle, Screen } from '@/components/ui/layout';
import { MACRO_KEYS, MINERAL_KEYS, NUTRIENT_LABELS, VITAMIN_KEYS, type NutrientKey } from '@/db/nutrients';
import { createProduct, getProductForEdit, updateProduct } from '@/db/repo/products';
import { OCR_AVAILABLE, recognizeNutritionLabel, type LabelBasis } from '@/lib/ocr';
import { deletePhoto, photoUri, savePhoto } from '@/lib/photos';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

/** 入力欄に出す栄養素。ビタミン・ミネラルは折りたたむ */
const MAIN_KEYS: NutrientKey[] = ['kcal', 'protein_g', 'fat_g', 'carb_g', 'fiber_g', 'salt_g'];

const STEPS = ['撮影', '読み取り', '確認', '保存'];

export default function ProductEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const settings = useAppStore((s) => s.settings);
  const editingId = params.id ? Number(params.id) : null;

  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [maker, setMaker] = useState('');
  const [basis, setBasis] = useState<LabelBasis>('100g');
  const [servingGrams, setServingGrams] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(editingId == null);

  // 編集のときは保存済みの値を読み込む
  useEffect(() => {
    if (editingId == null) return;
    let cancelled = false;
    getProductForEdit(editingId)
      .then((product) => {
        if (cancelled || !product) return;
        setName(product.name);
        setMaker(product.maker ?? '');
        setBasis(product.basis);
        setServingGrams(product.servingGrams != null ? String(product.servingGrams) : '');
        setPhotoPath(product.labelPhotoPath);
        const text: Record<string, string> = {};
        for (const [key, value] of Object.entries(product.values)) {
          if (value != null) text[key] = String(value);
        }
        setValues(text);
        setLoaded(true);
      })
      .catch((error) => console.error('商品の読み込みに失敗しました', error));
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  async function attachPhoto(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('アクセスが許可されていません', '端末の設定から許可してください。');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    // 「保存しない」設定のときは端末に残さず、その場の確認だけに使う
    if (settings.labelPhotoRetentionDays < 0) {
      Alert.alert(
        '成分表の画像は保存しない設定です',
        '画像を見ながら値を入力してください。設定から保存期間を変えられます。'
      );
      return;
    }

    const path = await savePhoto(asset.uri, 'label', {
      width: asset.width,
      height: asset.height,
    });
    if (photoPath) deletePhoto(photoPath);
    setPhotoPath(path);

    // 読み取り処理は差し替え可能にしてある。いまは何も返さない
    const draft = await recognizeNutritionLabel(asset.uri);
    if (draft.recognized) {
      if (draft.name) setName(draft.name);
      setBasis(draft.basis);
      if (draft.servingGrams != null) setServingGrams(String(draft.servingGrams));
      const text: Record<string, string> = {};
      for (const [key, value] of Object.entries(draft.values)) {
        if (value != null) text[key] = String(value);
      }
      setValues((previous) => ({ ...previous, ...text }));
    }
  }

  const canSave = name.trim() !== '' && Number(values.kcal ?? 0) > 0;
  const basisReady = basis === '100g' || Number(servingGrams) > 0;

  async function handleSave() {
    if (saving || !canSave) return;
    if (!basisReady) {
      Alert.alert('内容量を入力してください', '1食あたりの表記では、1食が何グラムかが必要です。');
      return;
    }
    setSaving(true);
    try {
      const parsed: Record<string, number> = {};
      for (const [key, text] of Object.entries(values)) {
        const value = Number(text);
        if (text.trim() !== '' && Number.isFinite(value)) parsed[key] = value;
      }
      const input = {
        name: name.trim(),
        maker: maker.trim() === '' ? null : maker.trim(),
        basis,
        servingGrams: basis === 'serving' ? Number(servingGrams) : null,
        values: parsed,
        labelPhotoPath: photoPath,
        registerServingUnit: basis === 'serving',
      };
      if (editingId != null) {
        await updateProduct(editingId, input);
      } else {
        await createProduct(input);
      }
      router.back();
    } catch (error) {
      console.error('商品の保存に失敗しました', error);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <Screen>
        <Text style={styles.loading}>読み込み中…</Text>
      </Screen>
    );
  }

  const uri = photoUri(photoPath);
  // 写真があれば「撮影」は済み。読み取りは未実装なので確認から手入力になる
  const currentStep = uri == null ? 0 : canSave ? 2 : 1;

  return (
    <Screen>
      {/* 進み具合 */}
      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step} style={styles.step}>
            <View
              style={[
                styles.stepBadge,
                index <= currentStep && styles.stepBadgeActive,
              ]}>
              <Text
                style={[styles.stepNumber, index <= currentStep && styles.stepNumberActive]}>
                {index + 1}
              </Text>
            </View>
            <Text style={styles.stepLabel}>{step}</Text>
          </View>
        ))}
      </View>

      {/* 成分表の写真 */}
      <Card>
        <CardTitle>成分表の写真</CardTitle>
        {uri != null ? (
          <>
            <Image source={{ uri }} style={styles.photo} contentFit="contain" />
            <View style={styles.photoActions}>
              <Pressable onPress={() => attachPhoto('camera')} style={styles.photoAction}>
                <Text style={styles.photoActionText}>撮り直す</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  deletePhoto(photoPath);
                  setPhotoPath(null);
                }}
                style={styles.photoAction}>
                <Text style={[styles.photoActionText, { color: colors.danger }]}>削除</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.photoButtons}>
            <Pressable onPress={() => attachPhoto('camera')} style={styles.photoButton}>
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={styles.photoButtonText}>撮影</Text>
            </Pressable>
            <Pressable onPress={() => attachPhoto('library')} style={styles.photoButton}>
              <Ionicons name="images-outline" size={18} color={colors.primary} />
              <Text style={styles.photoButtonText}>写真を選ぶ</Text>
            </Pressable>
          </View>
        )}
        {!OCR_AVAILABLE && (
          <Text style={styles.note}>
            自動での読み取りはまだ対応していません。撮った写真を見ながら値を入力してください。
            入力した栄養データは、写真の保存期間が過ぎても残ります。
          </Text>
        )}
      </Card>

      {/* 商品の情報 */}
      <Card>
        <CardTitle>商品</CardTitle>
        <Field label="商品名">
          <TextField value={name} onChangeText={setName} placeholder="例: サラダチキン プレーン" />
        </Field>
        <Field label="メーカー（任意）">
          <TextField value={maker} onChangeText={setMaker} placeholder="例: 〇〇食品" />
        </Field>
      </Card>

      {/* 基準量 */}
      <Card>
        <CardTitle>成分表の基準</CardTitle>
        <Field label="どちらの表記か" hint="パッケージに書かれているとおりに選んでください">
          <SegmentedControl<LabelBasis>
            options={[
              { value: '100g', label: '100gあたり' },
              { value: 'serving', label: '1食あたり' },
            ]}
            value={basis}
            onChange={setBasis}
          />
        </Field>
        {basis === 'serving' && (
          <Field label="1食の内容量" hint="100gあたりに換算して保存します">
            <NumberInput value={servingGrams} onChangeText={setServingGrams} unit="g" placeholder="110" />
          </Field>
        )}
      </Card>

      {/* 栄養価 */}
      <Card>
        <CardTitle>栄養成分</CardTitle>
        {MAIN_KEYS.map((key) => (
          <Field key={key} label={NUTRIENT_LABELS[key].label}>
            <NumberInput
              value={values[key] ?? ''}
              onChangeText={(text) => setValues((previous) => ({ ...previous, [key]: text }))}
              unit={NUTRIENT_LABELS[key].unit}
              placeholder="0"
            />
          </Field>
        ))}

        <Pressable onPress={() => setShowDetails((value) => !value)} style={styles.toggle}>
          <Text style={styles.toggleText}>
            {showDetails ? 'ビタミン・ミネラルを隠す' : 'ビタミン・ミネラルも入力する'}
          </Text>
        </Pressable>

        {showDetails &&
          [...VITAMIN_KEYS, ...MINERAL_KEYS].map((key) => (
            <Field key={key} label={NUTRIENT_LABELS[key].label}>
              <NumberInput
                value={values[key] ?? ''}
                onChangeText={(text) => setValues((previous) => ({ ...previous, [key]: text }))}
                unit={NUTRIENT_LABELS[key].unit}
                placeholder="0"
              />
            </Field>
          ))}
      </Card>

      <Button
        title={saving ? '保存中…' : editingId != null ? '更新する' : '保存する'}
        onPress={handleSave}
        disabled={saving || !canSave}
      />
      {!canSave && (
        <Text style={styles.note}>商品名とエネルギーを入力すると保存できます。</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { textAlign: 'center', color: colors.textFaint, padding: spacing.xl },
  steps: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  step: { alignItems: 'center', gap: 4 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeActive: { backgroundColor: colors.primary },
  stepNumber: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textFaint },
  stepNumberActive: { color: colors.textOnPrimary },
  stepLabel: { fontSize: fontSize.xs, color: colors.textSub },

  photo: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  photoActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  photoAction: { padding: spacing.xs },
  photoActionText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  photoButtons: { flexDirection: 'row', gap: spacing.md },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoButtonText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },

  toggle: { paddingVertical: spacing.sm },
  toggleText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
});

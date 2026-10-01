import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {saveReadingBookmark} from '../../services/readerBookmarks';
import {colors, radius, spacing} from '../../theme';

export const ReaderBookmarkMenu = ({
  visible,
  onClose,
  navigation,
  bookmark,
  canReturnToProgress = false,
  onReturnToProgress,
  languageOptions = [],
  activeLanguage = null,
  onLanguageChange,
}) => {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (visible) {
      setMessage('');
    }
  }, [visible]);

  const addBookmark = async () => {
    if (!bookmark || saving) {
      return;
    }

    try {
      setSaving(true);
      setMessage('');

      const result = await saveReadingBookmark(bookmark);

      setMessage(result.created ? 'Закладка добавлена' : 'Такая закладка уже есть');
    } catch (error) {
      console.log('Ошибка добавления закладки:', error.message);
      setMessage('Не удалось добавить закладку');
    } finally {
      setSaving(false);
    }
  };

  const openBookmarks = () => {
    onClose?.();
    navigation?.navigate('Favorites', {tab: 'places'});
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
          onPress={() => {}}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>Место чтения</Text>

          {!!languageOptions.length && (
            <View style={styles.languageSection}>
              <Text style={styles.languageTitle}>Текст</Text>

              <View style={styles.languageRow}>
                {languageOptions.map((option) => {
                  const active = option.key === activeLanguage;

                  return (
                    <Pressable
                      key={option.key}
                      disabled={option.disabled}
                      onPress={() => onLanguageChange?.(option.key)}
                      style={({pressed}) => [
                        styles.languageChip,
                        active && styles.languageChipActive,
                        option.disabled && styles.languageChipDisabled,
                        pressed && !option.disabled && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.languageChipText,
                          active && styles.languageChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Pressable
            disabled={!bookmark || saving}
            onPress={addBookmark}
            style={({pressed}) => [
              styles.action,
              (!bookmark || saving) && styles.actionDisabled,
              pressed && bookmark && !saving && styles.pressed,
            ]}
          >
            <View style={styles.iconWrap}>
              {saving ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.icon}>⌑</Text>
              )}
            </View>

            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>Добавить закладку</Text>
              <Text style={styles.actionSubtitle}>
                {bookmark
                  ? 'Сохранить это место независимо от прогресса чтения'
                  : 'Позиция появится после начала чтения'}
              </Text>
            </View>
          </Pressable>

          {canReturnToProgress && (
            <Pressable
              onPress={onReturnToProgress}
              style={({pressed}) => [styles.action, pressed && styles.pressed]}
            >
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>↩</Text>
              </View>

              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>Вернуться к месту чтения</Text>
                <Text style={styles.actionSubtitle}>
                  Перейти к последней устойчиво сохранённой позиции
                </Text>
              </View>
            </Pressable>
          )}

          <Pressable
            onPress={openBookmarks}
            style={({pressed}) => [styles.action, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Text style={styles.icon}>☰</Text>
            </View>

            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>Открыть места</Text>
              <Text style={styles.actionSubtitle}>Перейти к постоянным закладкам в «Избранном»</Text>
            </View>
          </Pressable>

          {!!message && <Text style={styles.message}>{message}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(38, 24, 14, 0.34)',
  },

  sheet: {
    paddingHorizontal: spacing.md,
    paddingTop: 9,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },

  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginBottom: spacing.md,
    borderRadius: 2,
    backgroundColor: 'rgba(111,71,39,0.24)',
  },

  title: {
    marginBottom: spacing.sm,
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: '700',
  },

  languageSection: {
    marginBottom: spacing.sm,
  },

  languageTitle: {
    marginBottom: 7,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  languageChip: {
    minHeight: 34,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  languageChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.borderStrong,
  },

  languageChipDisabled: {
    opacity: 0.35,
  },

  languageChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },

  languageChipTextActive: {
    color: colors.accentDark,
  },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 70,
    marginTop: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  actionDisabled: {
    opacity: 0.48,
  },

  pressed: {
    opacity: 0.66,
  },

  iconWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: colors.accentSoft,
  },

  icon: {
    color: colors.accent,
    fontSize: 20,
  },

  actionTextWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },

  actionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },

  actionSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },

  message: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
});

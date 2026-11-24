import React, {createContext, useCallback, useContext, useRef, useState} from 'react';

import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';

import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, radius, spacing} from '../theme';

const TextSelectionContext = createContext(null);

export const TextSelectionProvider = ({children}) => {
  const insets = useSafeAreaInsets();

  const [activeSelection, setActiveSelection] = useState(null);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const activeRef = useRef(null);

  const activateSelection = useCallback((next) => {
    const previous = activeRef.current;

    if (previous && previous.id !== next.id) {
      previous.onClear?.();
    }

    activeRef.current = next;

    setActiveSelection(next);

    setError('');
  }, []);

  const clearSelection = useCallback((id) => {
    const current = activeRef.current;

    if (!current || (id && current.id !== id)) {
      return;
    }

    activeRef.current = null;

    setActiveSelection(null);

    setSaving(false);

    setError('');
  }, []);

  const closeSelection = useCallback(() => {
    const current = activeRef.current;

    current?.onClear?.();

    clearSelection(current?.id);
  }, [clearSelection]);

  const saveSelection = useCallback(async () => {
    const current = activeRef.current;

    if (!current || !current.canSave || saving) {
      return;
    }

    try {
      setSaving(true);

      setError('');

      const result = await current.onSave();

      if (result?.ok === false) {
        setError(result.message || 'Не удалось сохранить');

        return;
      }

      clearSelection(current.id);
    } catch (saveError) {
      console.log('Ошибка сохранения выделения:', saveError);

      setError('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }, [clearSelection, saving]);

  return (
    <TextSelectionContext.Provider
      value={{
        activeSelection,
        activateSelection,
        clearSelection,
      }}
    >
      <View style={styles.root}>
        {children}

        {!!activeSelection && (
          <View
            style={[
              styles.bar,
              {
                bottom: Math.max(insets.bottom, 10) + 98,
              },
            ]}
          >
            <View style={styles.info}>
              <Text style={[styles.counter, activeSelection.tooLong && styles.counterError]}>
                {activeSelection.count} симв.
              </Text>

              {activeSelection.tooLong ? (
                <Text style={styles.hintError}>Сократите выделение</Text>
              ) : (
                <Text style={styles.hint}>Выделенный фрагмент</Text>
              )}

              {!!error && <Text style={styles.hintError}>{error}</Text>}
            </View>

            <Pressable
              hitSlop={8}
              onPress={closeSelection}
              style={({pressed}) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>

            {!!activeSelection.onShare && (
              <Pressable
                hitSlop={8}
                disabled={saving || activeSelection.count <= 0}
                accessibilityRole="button"
                accessibilityLabel="Поделиться выделенным текстом"
                onPress={() => activeRef.current?.onShare?.()}
                style={({pressed}) => [styles.shareButton,pressed && styles.pressed]}
              >
                <Text style={styles.shareText}>Поделиться</Text>
              </Pressable>
            )}

            <Pressable
              disabled={!activeSelection.canSave || saving}
              onPress={saveSelection}
              style={({pressed}) => [
                styles.saveButton,

                (!activeSelection.canSave || saving) && styles.saveButtonDisabled,

                pressed && activeSelection.canSave && !saving && styles.pressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveText}>{activeSelection.actionLabel || 'Сохранить'}</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </TextSelectionContext.Provider>
  );
};

export const useTextSelection = () => {
  const context = useContext(TextSelectionContext);

  if (!context) {
    throw new Error('useTextSelection должен использоваться внутри TextSelectionProvider');
  }

  return context;
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  bar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    minHeight: 58,
    paddingVertical: 9,
    paddingLeft: 14,
    paddingRight: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 1000,
  },

  info: {
    flex: 1,
  },

  counter: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accentDark,
  },

  counterError: {
    color: colors.liturgical,
  },

  hint: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textMuted,
  },

  hintError: {
    marginTop: 2,
    fontSize: 11,
    color: colors.liturgical,
  },

  closeButton: {
    width: 34,
    height: 34,
    marginHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    fontSize: 24,
    lineHeight: 26,
    color: colors.textMuted,
  },

  shareButton:{minHeight:38,paddingHorizontal:8,alignItems:'center',
    justifyContent:'center',borderRadius:10,borderWidth:1,borderColor:colors.borderStrong},
  shareText:{fontSize:12,fontWeight:'700',color:colors.accentDark},

  saveButton: {
    minWidth: 83,
    height: 38,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },

  saveButtonDisabled: {
    opacity: 0.38,
  },

  saveText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },

  pressed: {
    opacity: 0.68,
  },
});

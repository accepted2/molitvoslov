import React from 'react';
import {ActivityIndicator, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// BOOK_ACTIONS_STACKED_MODAL_20261117: shared confirmation in the app's parchment palette.
export const BookDeleteConfirmModal = ({
  visible, title, message, onCancel, onConfirm, busy = false,
  confirmLabel = 'Удалить',
}) => (
  <Modal
    visible={!!visible}
    transparent
    statusBarTranslucent
    animationType="fade"
    onRequestClose={() => { if (!busy) onCancel?.(); }}
  >
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFillObject}
        accessibilityLabel="Закрыть подтверждение"
        onPress={() => { if (!busy) onCancel?.(); }}
      />
      <View style={styles.panel} accessibilityViewIsModal>
        <View style={styles.iconCircle}>
          <Ionicons name="trash-outline" size={24} color="#A34738" />
        </View>
        <Text style={styles.title}>{title || 'Удалить?'}</Text>
        <Text style={styles.message}>{message || 'Вы действительно хотите удалить запись?'}</Text>
        <View style={styles.divider} />
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            disabled={busy}
            style={({pressed}) => [styles.cancel, pressed && styles.pressed, busy && styles.disabled]}
          >
            <Text style={styles.cancelText}>Отмена</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onConfirm}
            disabled={busy}
            style={({pressed}) => [styles.delete, pressed && styles.pressed, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator color="#FFF8EA" size="small" /> :
              <Text style={styles.deleteText}>{confirmLabel}</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(36, 25, 17, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D9BC91',
    backgroundColor: '#FFF4DE',
    elevation: 14,
    shadowColor: '#392516',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    alignItems: 'center',
  },
  iconCircle: {
    width: 54, height: 54,
    borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4B6A4',
    backgroundColor: '#F6E4D6',
    marginBottom: 13,
  },
  title: {
    color: '#4C3120',
    fontFamily: 'serif',
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 27,
  },
  message: {
    marginTop: 10,
    color: '#765741',
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  divider: {width: '100%', height: 1, backgroundColor: '#E5D0B0', marginVertical: 19},
  buttons: {width: '100%', flexDirection: 'row', gap: 10},
  cancel: {
    flex: 1, minHeight: 48, borderRadius: 12,
    borderWidth: 1, borderColor: '#CDB38D',
    backgroundColor: '#FFF9EC',
    alignItems: 'center', justifyContent: 'center',
  },
  delete: {
    flex: 1, minHeight: 48, borderRadius: 12,
    backgroundColor: '#A34738',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: {color: '#60442F', fontSize: 15, fontWeight: '700'},
  deleteText: {color: '#FFF8EA', fontSize: 15, fontWeight: '700'},
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.5},
});

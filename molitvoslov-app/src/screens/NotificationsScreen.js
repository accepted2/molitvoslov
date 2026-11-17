import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch,
  Text, TextInput, View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import Feather from '@expo/vector-icons/Feather';
import {
  REMINDER_TARGETS, readPrayerReminders, savePrayerReminder,
  deletePrayerReminder, setPrayerReminderEnabled, reminderTimeValid,
  routeForPrayerReminder, reconcilePrayerReminders, previewPrayerReminder,
  getPrayerReminderScheduleStatuses,
} from '../services/localPrayerReminders';

const INK = '#49301D';
const BORDER = '#E5CEAD';
const ACCENT = '#875B38';
const DAYS = [
  {id: 1, text: 'Пн'}, {id: 2, text: 'Вт'}, {id: 3, text: 'Ср'},
  {id: 4, text: 'Чт'}, {id: 5, text: 'Пт'}, {id: 6, text: 'Сб'},
  {id: 7, text: 'Вс'},
];
const ALL_DAYS = DAYS.map(day => day.id);
const preset = key => REMINDER_TARGETS.find(item => item.key === key) || REMINDER_TARGETS[0];
const initialDraft = () => ({
  id: null, target: 'morning', title: preset('morning').body,
  time: '07:00', days: [...ALL_DAYS], enabled: true,
});

const periodLabel = days => {
  if (days.length === 7) return 'Ежедневно';
  if (!days.length) return 'Дни не выбраны';
  return DAYS.filter(day => days.includes(day.id)).map(day => day.text).join(', ');
};
const sortByTime = records => [...records].sort((a, b) => a.time.localeCompare(b.time));

export const NotificationsScreen = ({navigation, route}) => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [scheduleStatuses, setScheduleStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);

  const load = useCallback(async () => {
    try {
      const records = await readPrayerReminders();
      setItems(sortByTime(records));
      try {
        const statuses = await getPrayerReminderScheduleStatuses();
        setScheduleStatuses(Object.fromEntries(statuses.map(status => [status.id, status])));
      } catch (error) {
        console.warn('[reminders] schedule status:', error?.message || error);
      }
    } catch (error) {
      Alert.alert('Напоминания', error?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    load();
    // Restore schedules cancelled by the OS, without requesting permission.
    reconcilePrayerReminders()
      .then(() => {if (active) load();})
      .catch(error => console.warn('[reminders] reconcile:', error?.message || error));
    return () => {active = false;};
  }, [load]));

  // Other readers can open the existing bell screen with a preselected type.
  useEffect(() => {
    if (route.params?.createTarget && !draft) {
      const target = preset(route.params.createTarget);
      setDraft({...initialDraft(), target: target.key, title: target.body});
      navigation.setParams({createTarget: undefined});
    }
  }, [route.params?.createTarget, draft, navigation]);

  const openCreate = () => setDraft(initialDraft());
  const openEdit = item => setDraft({
    id: item.id, title: item.title, target: item.target, time: item.time,
    days: [...item.days], enabled: item.enabled,
  });
  const changeDraft = update => setDraft(previous => ({...previous, ...update}));
  const chooseTarget = key => {
    const target = preset(key);
    changeDraft({target: key, title: target.body});
  };
  const toggleDay = day => changeDraft({
    days: draft.days.includes(day)
      ? draft.days.filter(item => item !== day)
      : [...draft.days, day].sort((a, b) => a - b),
  });

  const save = async (forceDisabled = false) => {
    if (!draft || busy) return;
    if (!draft.title.trim()) {
      Alert.alert('Название', 'Введите название напоминания.');
      return;
    }
    if (!reminderTimeValid(draft.time)) {
      Alert.alert('Время', 'Используйте формат 07:00 (от 00:00 до 23:59).');
      return;
    }
    if (!draft.days.length) {
      Alert.alert('Расписание', 'Выберите хотя бы один день.');
      return;
    }
    setBusy(true);
    try {
      await savePrayerReminder({...draft, enabled: forceDisabled ? false : draft.enabled});
      setDraft(null);
      await load();
    } catch (error) {
      const message = String(error?.message || error);
      if (!forceDisabled && /уведомления запрещены/i.test(message)) {
        Alert.alert(
          'Нет разрешения на уведомления',
          message,
          [
            {text: 'Назад', style: 'cancel'},
            {text: 'Сохранить выключенным', onPress: () => savePrayerReminder(
              {...draft, enabled: false}
            ).then(() => {
              setDraft(null);
              load();
            }).catch(err => Alert.alert('Ошибка', String(err?.message || err)))},
          ]
        );
      } else {
        Alert.alert('Не удалось сохранить', message);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggle = async item => {
    if (busy) return;
    setBusy(true);
    try {
      await setPrayerReminderEnabled(item.id, !item.enabled);
      await load();
    } catch (error) {
      Alert.alert('Напоминания', String(error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const remove = item => {
    Alert.alert(
      'Удалить напоминание?',
      item.title,
      [
        {text: 'Отмена', style: 'cancel'},
        {text: 'Удалить', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            await deletePrayerReminder(item.id);
            if (draft?.id === item.id) setDraft(null);
            await load();
          } catch (error) {
            Alert.alert('Не удалось удалить', String(error?.message || error));
          } finally {
            setBusy(false);
          }
        }},
      ]
    );
  };

  const preview = async item => {
    if (busy) return;
    setBusy(true);
    try {
      await previewPrayerReminder(item.id);
      Alert.alert('Пробное уведомление', 'Уведомление появится приблизительно через 8 секунд.');
    } catch (error) {
      Alert.alert('Не удалось проверить', String(error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const openLinkedText = item => {
    const dest = routeForPrayerReminder(item);
    if (dest.name !== 'Notifications') navigation.navigate(dest.name, dest.params);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад"
          onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="chevron-left" size={25} color={INK} />
        </Pressable>
        <Text style={styles.headerTitle}>Уведомления</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={{paddingHorizontal: 18, paddingBottom: Math.max(34, insets.bottom + 20)}}>
        {!draft ? (
          <>
            <View style={styles.intro}>
              <Feather name="bell" size={22} color={ACCENT} />
              <Text style={styles.introText}>
                Личные напоминания о молитве и чтении. Работают без интернета.
                Ничего не включается без вашего согласия.
              </Text>
            </View>
            <Pressable accessibilityRole="button" style={styles.primaryButton}
              onPress={openCreate}>
              <Feather name="plus" size={19} color="#FFF6E5" />
              <Text style={styles.primaryButtonText}>Добавить напоминание</Text>
            </Pressable>

            <Text style={styles.sectionHeading}>Мои напоминания</Text>
            {loading ? (
              <ActivityIndicator color={ACCENT} style={{marginTop: 28}} />
            ) : items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="clock" size={26} color="#AB8764" />
                <Text style={styles.emptyTitle}>Напоминаний пока нет</Text>
                <Text style={styles.muted}>Выберите молитву и время, в которое вам удобно читать.</Text>
              </View>
            ) : items.map(item => (
              <View key={item.id} style={styles.reminderCard}>
                <View style={styles.reminderTop}>
                  <View style={{flex: 1, paddingRight: 8}}>
                    <Text style={styles.reminderTime}>{item.time}</Text>
                    <Text style={styles.reminderTitle}>{item.title}</Text>
                    <Text style={styles.muted}>{periodLabel(item.days)}</Text>
                    {item.enabled && (() => {
                      const status = scheduleStatuses[item.id];
                      const next = status?.nextAt
                        ? new Date(status.nextAt).toLocaleString('ru-RU', {
                          weekday: 'short', day: 'numeric', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        }) : null;
                      const message = !status ? 'Проверяем расписание…'
                        : !status.permitted ? 'Уведомления запрещены в настройках Android'
                          : !status.ready ? 'Расписание не подтверждено Android — откройте экран повторно'
                            : 'Запланировано ' + status.registered + '/' + status.expected +
                              ' · Следующее: ' + next;
                      return <View>
                        <Text style={[styles.scheduleStatus,
                          status && !status.ready && styles.scheduleWarning]}>{message}</Text>
                        {status?.ready && !status.channelAudible && (
                          <Text style={[styles.scheduleStatus, styles.scheduleWarning]}>
                            Android отключил звук канала. Проверьте звук уведомлений
                            для "Молитвослова" в настройках телефона.
                          </Text>
                        )}
                      </View>;
                    })()}
                  </View>
                  <Switch
                    accessibilityLabel={item.enabled ? 'Выключить напоминание' : 'Включить напоминание'}
                    value={item.enabled} onValueChange={() => toggle(item)}
                    disabled={busy}
                    trackColor={{false: '#D7C4AB', true: '#A37B50'}}
                    thumbColor="#FFF3DB"
                  />
                </View>
                <View style={styles.cardActions}>
                  <Pressable accessibilityRole="button" onPress={() => openEdit(item)} style={styles.linkAction}>
                    <Feather name="edit-2" size={15} color={ACCENT} />
                    <Text style={styles.linkText}>Изменить</Text>
                  </Pressable>
                  {item.target !== 'custom' && (
                    <Pressable accessibilityRole="button" onPress={() => openLinkedText(item)} style={styles.linkAction}>
                      <Feather name="book-open" size={15} color={ACCENT} />
                      <Text style={styles.linkText}>Открыть</Text>
                    </Pressable>
                  )}
                  <Pressable accessibilityRole="button" onPress={() => preview(item)} style={styles.linkAction}>
                    <Feather name="bell" size={15} color={ACCENT} />
                    <Text style={styles.linkText}>Проверить</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => remove(item)} style={styles.linkAction}>
                    <Feather name="trash-2" size={15} color="#9B5845" />
                    <Text style={[styles.linkText, {color: '#9B5845'}]}>Удалить</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={styles.sectionHeading}>
              {draft.id ? 'Изменить напоминание' : 'Новое напоминание'}
            </Text>
            <Text style={styles.fieldLabel}>О чём напомнить</Text>
            <View style={styles.presetGrid}>
              {REMINDER_TARGETS.map(target => (
                <Pressable key={target.key} accessibilityRole="button"
                  accessibilityState={{selected: draft.target === target.key}}
                  onPress={() => chooseTarget(target.key)}
                  style={[styles.preset, draft.target === target.key && styles.presetSelected]}>
                  <Text style={[styles.presetText, draft.target === target.key && styles.presetTextSelected]}>
                    {target.title}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Текст уведомления</Text>
            <TextInput
              accessibilityLabel="Текст напоминания"
              style={styles.textInput} maxLength={110} value={draft.title}
              placeholder="Например, время вечерней молитвы"
              placeholderTextColor="#9F846A"
              onChangeText={title => changeDraft({title})}
            />
            <Text style={styles.fieldLabel}>Время</Text>
            <TextInput
              accessibilityLabel="Время в формате часы двоеточие минуты"
              style={[styles.textInput, {width: 124, textAlign: 'center'}]}
              value={draft.time}
              maxLength={5} keyboardType="numbers-and-punctuation"
              placeholder="07:00"
              onChangeText={time => changeDraft({time})}
            />
            <Text style={styles.fieldLabel}>Дни недели</Text>
            <View style={styles.dayRow}>
              {DAYS.map(day => (
                <Pressable key={day.id} accessibilityRole="button"
                  accessibilityState={{selected: draft.days.includes(day.id)}}
                  onPress={() => toggleDay(day.id)}
                  style={[styles.dayPill, draft.days.includes(day.id) && styles.dayPillSelected]}>
                  <Text style={[styles.dayText, draft.days.includes(day.id) && styles.dayTextSelected]}>
                    {day.text}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => changeDraft({
              days: draft.days.length === 7 ? [] : [...ALL_DAYS],
            })}>
              <Text style={[styles.linkText, {marginTop: 12}]}>
                {draft.days.length === 7 ? 'Снять выделение дней' : 'Выбрать всю неделю'}
              </Text>
            </Pressable>
            <View style={styles.enabledRow}>
              <Text style={styles.reminderTitle}>Напоминание включено</Text>
              <Switch value={draft.enabled} onValueChange={enabled => changeDraft({enabled})}
                trackColor={{false: '#D7C4AB', true: '#A37B50'}} thumbColor="#FFF3DB" />
            </View>
            <Text style={[styles.muted, {marginBottom: 18}]}>
              При первом включении Android запросит разрешение. Нажатие на уведомление
              открывает выбранный раздел приложения. Для "Своего напоминания" откроется список.
              Звук использует системную громкость уведомлений; режим "Без звука",
              "Не беспокоить" и энергосбережение могут ограничить доставку.
            </Text>
            <Pressable accessibilityRole="button" disabled={busy}
              onPress={() => save()} style={[styles.primaryButton, busy && {opacity: 0.6}]}>
              {busy ? <ActivityIndicator color="#FFF6E5" /> : <Feather name="check" size={19} color="#FFF6E5" />}
              <Text style={styles.primaryButtonText}>Сохранить</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy}
              onPress={() => setDraft(null)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Отмена</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#FFF4DE'},
  header: {height: 57, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    backgroundColor: '#FFF4DE', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER},
  backButton: {width: 42, height: 42, alignItems: 'center', justifyContent: 'center'},
  headerTitle: {flex: 1, fontFamily: 'serif', color: INK, fontWeight: '700', fontSize: 21},
  headerSpacer: {width: 14},
  intro: {flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 15,
    marginTop: 18, marginBottom: 16, borderRadius: 15, backgroundColor: '#F8E8CC'},
  introText: {flex: 1, color: '#76553B', fontSize: 13, lineHeight: 20},
  primaryButton: {minHeight: 48, borderRadius: 13, backgroundColor: '#80502F',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 8},
  primaryButtonText: {color: '#FFF6E5', fontSize: 15, fontWeight: '700'},
  sectionHeading: {fontFamily: 'serif', fontSize: 19, color: INK,
    marginTop: 20, marginBottom: 14, fontWeight: '700'},
  emptyCard: {borderWidth: 1, borderColor: BORDER, backgroundColor: '#FCEDD5',
    padding: 28, alignItems: 'center', borderRadius: 15, gap: 10},
  emptyTitle: {fontSize: 17, color: INK, fontWeight: '700'},
  muted: {fontSize: 12, lineHeight: 18, color: '#8A6E54'},
  reminderCard: {borderWidth: 1, borderColor: BORDER, backgroundColor: '#FCEDD5',
    borderRadius: 14, padding: 14, marginBottom: 10},
  reminderTop: {flexDirection: 'row', alignItems: 'center'},
  reminderTime: {fontSize: 26, fontWeight: '600', color: '#76502F', marginBottom: 4},
  scheduleStatus: {fontSize: 12, lineHeight: 18, color: '#5E724B', marginTop: 5},
  scheduleWarning: {color: '#A4583D'},
  reminderTitle: {fontSize: 15, fontWeight: '600', color: INK, lineHeight: 21},
  cardActions: {flexDirection: 'row', flexWrap: 'wrap', gap: 17, marginTop: 12,
    paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER},
  linkAction: {flexDirection: 'row', gap: 5, alignItems: 'center', minHeight: 28},
  linkText: {fontSize: 13, fontWeight: '600', color: ACCENT},
  fieldLabel: {fontSize: 14, fontWeight: '700', color: INK, marginTop: 14, marginBottom: 8},
  presetGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  preset: {paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#F7E7CB',
    borderRadius: 11, borderWidth: 1, borderColor: BORDER},
  presetSelected: {backgroundColor: '#80502F', borderColor: '#80502F'},
  presetText: {color: INK, fontSize: 13},
  presetTextSelected: {color: '#FFF4DE', fontWeight: '700'},
  textInput: {fontSize: 16, minHeight: 46, borderRadius: 11, paddingHorizontal: 12,
    backgroundColor: '#FFFAEE', borderColor: BORDER, borderWidth: 1, color: INK},
  dayRow: {flexDirection: 'row', gap: 5, justifyContent: 'space-between'},
  dayPill: {flex: 1, paddingVertical: 11, alignItems: 'center', borderWidth: 1,
    borderRadius: 9, borderColor: BORDER, backgroundColor: '#F9EAD2'},
  dayPillSelected: {backgroundColor: '#80502F', borderColor: '#80502F'},
  dayText: {color: INK, fontSize: 12},
  dayTextSelected: {color: '#FFF4DE', fontWeight: '700'},
  enabledRow: {flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 20, marginBottom: 10},
  cancelButton: {height: 44, alignItems: 'center', justifyContent: 'center'},
  cancelText: {color: ACCENT, fontWeight: '700'},
});

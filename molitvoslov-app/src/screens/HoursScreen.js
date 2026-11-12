import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';

import {AppBackground} from '../components/layout/AppBackground';
import {BottomNav} from '../components/navigation/BottomNav';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {useInterfaceScale} from '../context/InterfaceScaleContext';
import {HOURS_GROUPS} from '../data/hoursCatalog';

export const HoursScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const uiScale = useInterfaceScale();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [expanded, setExpanded] = useState({ordinary: true});

  const toggleGroup = (id) => {
    setExpanded((previous) => ({...previous, [id]: !previous[id]}));
  };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {paddingTop: headerHeight + 18, paddingBottom: 94 + insets.bottom},
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={[styles.introTitle, {fontSize: 17 * uiScale}]}>
            Последования богослужебных часов
          </Text>
          <Text style={[styles.introText, {fontSize: 13 * uiScale}]}>
            Первый, третий, шестой и девятый часы. В особые дни используются
            великопостный, царский или пасхальный чины. Междочасия приведены отдельно.
          </Text>
          <Text style={[styles.onlineNote, {fontSize: 12 * uiScale}]}>
            Полные тексты открываются внутри приложения с сайта источника.
            Для чтения нужен интернет; офлайн-тексты пока не импортированы.
          </Text>
        </View>

        {HOURS_GROUPS.map((group) => {
          const opened = !!expanded[group.id];
          return (
            <View key={group.id} style={styles.group}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={group.title}
                accessibilityState={{expanded: opened}}
                onPress={() => toggleGroup(group.id)}
                style={({pressed}) => [styles.groupHeader, pressed && styles.pressed]}
              >
                <View style={styles.groupHeading}>
                  <Text style={[styles.groupTitle, {fontSize: 18 * uiScale}]}>
                    {group.title}
                  </Text>
                  <Text style={[styles.groupCount, {fontSize: 11 * uiScale}]}>
                    {group.items.length === 1
                      ? 'Одно последование'
                      : group.items.length + ' последования'}
                  </Text>
                </View>
                <Ionicons
                  name={opened ? 'chevron-up' : 'chevron-down'}
                  size={19}
                  color="#724D31"
                />
              </Pressable>

              {opened && (
                <View style={styles.groupBody}>
                  <Text style={[styles.description, {fontSize: 12 * uiScale}]}>
                    {group.description}
                  </Text>
                  {group.items.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      onPress={() => navigation.navigate('HoursReading', {entryId: item.id})}
                      style={({pressed}) => [styles.hourRow, pressed && styles.pressed]}
                    >
                      <View style={styles.hourText}>
                        <Text style={[styles.hourTitle, {fontSize: 16 * uiScale}]}>
                          {item.title}
                        </Text>
                        {!!item.subtitle && (
                          <Text style={[styles.hourSubtitle, {fontSize: 12 * uiScale}]}>
                            {item.subtitle}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#8B633F" />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        <Text style={[styles.footer, {fontSize: 12 * uiScale}]}>
          Изобразительные связаны с часами, но являются отдельным богослужебным
          последованием. Изменяемые тропари, кондаки и чтения зависят от дня.
        </Text>
      </ScrollView>

      <FixedSectionHeader
        title="Часы"
        navigation={navigation}
        topInset={insets.top}
        onHeaderHeightChange={setHeaderHeight}
      />
      <BottomNav navigation={navigation} active={null} />
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  scroll: {flex: 1},
  content: {paddingHorizontal: 14, gap: 12},
  intro: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 15,
    backgroundColor: 'rgba(250, 239, 216, 0.93)',
    borderWidth: 1,
    borderColor: 'rgba(130, 88, 43, 0.20)',
    gap: 8,
  },
  introTitle: {color: '#482D1E', fontWeight: '700', fontFamily: 'serif'},
  introText: {color: '#624A34', lineHeight: 21, textAlign: 'justify'},
  onlineNote: {color: '#7D5D3C', lineHeight: 19},
  group: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(250, 237, 212, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.22)',
  },
  groupHeader: {
    minHeight: 71,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupHeading: {flex: 1, gap: 4},
  groupTitle: {fontFamily: 'serif', fontWeight: '700', color: '#452C1C'},
  groupCount: {color: '#856548'},
  groupBody: {paddingHorizontal: 13, paddingBottom: 11, gap: 4},
  description: {
    color: '#765A41',
    lineHeight: 20,
    paddingHorizontal: 5,
    paddingBottom: 7,
  },
  hourRow: {
    minHeight: 56,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 250, 239, 0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  hourText: {flex: 1, gap: 4},
  hourTitle: {fontFamily: 'serif', color: '#4B3020', fontWeight: '600'},
  hourSubtitle: {color: '#866D54', lineHeight: 17},
  footer: {color: '#75583F', lineHeight: 19, paddingHorizontal: 8, paddingVertical: 9},
  pressed: {opacity: 0.67},
});

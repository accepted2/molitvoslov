import React, {useState} from 'react';
import {Alert, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useLanguage} from '../../context/LanguageContext';
import {traditionalUiTextStyle} from '../../services/traditionalUiTypography';
import {getProjectSupportUrl} from '../../services/projectSupport';
import {projectSupportCopy} from '../../i18n/supportCopy';

// Donation flow is entirely external. No credit-card fields, user identity,
// inferred transaction status, recurring charge or account requirement.
export const ProjectSupportSection = () => {
  const {language} = useLanguage();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const copy = projectSupportCopy(language);
  const url = getProjectSupportUrl();
  const csl = (size, height) => traditionalUiTextStyle(language, size, height);

  const openDonationPage = async () => {
    if (!url) return;
    try {
      if (!await Linking.canOpenURL(url)) throw new Error('No browser');
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(copy.openError);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="heart-outline" size={21} color="#8B5530" />
        <Text style={[styles.heading, csl(17, 26)]}>{copy.title}</Text>
      </View>

      <Text style={[styles.description, csl(13, 21)]}>{copy.description}</Text>
      {url ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={copy.donate}
          onPress={openDonationPage}
          style={({pressed}) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={[styles.actionText, csl(14, 22)]}>{copy.donate}</Text>
          <Ionicons name="open-outline" size={17} color="#FFF1D4" />
        </Pressable>
      ) : (
        <Text style={[styles.pending, csl(12, 20)]}>{copy.pending}</Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{expanded: detailsExpanded}}
        onPress={() => setDetailsExpanded(value => !value)}
        style={styles.detailButton}
      >
        <Text style={[styles.detailLabel, csl(13, 21)]}>{copy.details}</Text>
        <Ionicons name={detailsExpanded ? 'chevron-up' : 'chevron-down'}
          size={17} color="#80502C" />
      </Pressable>
      {detailsExpanded && (
        <Text style={[styles.detailText, csl(12, 21)]}>{copy.detailText}</Text>
      )}
      <Text style={[styles.voluntary, csl(12, 20)]}>{copy.voluntary}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 16, padding: 16, borderRadius: 14, gap: 10,
    backgroundColor: '#F7E8CF', borderWidth: 1, borderColor: '#E2CCAA',
  },
  header: {flexDirection: 'row', alignItems: 'center', gap: 9},
  heading: {flex: 1, fontSize: 17, lineHeight: 25, color: '#503524', fontWeight: '700'},
  description: {fontSize: 13, lineHeight: 21, color: '#69472B'},
  action: {
    minHeight: 45, borderRadius: 12, backgroundColor: '#84502C',
    paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row',
    gap: 8, alignItems: 'center', justifyContent: 'center',
  },
  actionText: {color: '#FFF1D4', fontWeight: '700', fontSize: 14, lineHeight: 21},
  pending: {
    color: '#725C47', fontSize: 12, lineHeight: 20, borderRadius: 9,
    backgroundColor: '#F1DCC0', paddingHorizontal: 10, paddingVertical: 10,
  },
  detailButton: {
    minHeight: 34, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 10,
  },
  detailLabel: {fontSize: 13, lineHeight: 21, color: '#684229'},
  detailText: {fontSize: 12, lineHeight: 20, color: '#71563D'},
  voluntary: {fontSize: 12, lineHeight: 20, color: '#836A52'},
  pressed: {opacity: 0.74},
});

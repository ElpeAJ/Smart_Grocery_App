import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoadingScreen({ label = 'Loading...' }: { label?: string }) {
  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color="#16A34A" />
      <Text style={styles.label}>{label}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
    padding: 24,
  },
  label: {
    marginTop: 14,
    fontSize: 15,
    color: '#64748B',
  },
});

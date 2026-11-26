import { Alert, Platform } from 'react-native';

/** A yes/no question before something that cannot be undone, such as cancelling. The browser's own dialog on the web. */
export function ask(question: string, yes: string, no: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(question));
  return new Promise((resolve) =>
    Alert.alert('', question, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Linking, Text } from 'react-native';
import { AppScreen, Card, Header, OptionCard, SectionTitle, ui } from '../../components/ui';
import type { RootStackParamList } from '../../types';

export function SupportScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Support'>) {
  return <AppScreen><Header title="Aide & support" subtitle="Nous sommes là 24h/24" onBack={() => navigation.goBack()} />
    <OptionCard icon="call" title="Appeler le support" subtitle="En cas de problème urgent" onPress={() => Linking.openURL('tel:+33100000000')} />
    <OptionCard icon="mail" title="Nous écrire" subtitle="support@mehdi-depannage.fr" onPress={() => Linking.openURL('mailto:support@mehdi-depannage.fr')} />
    <SectionTitle>Questions fréquentes</SectionTitle>
    <Faq q="Quand serai-je débité ?" a="Le montant est préautorisé avant la mission, puis débité lorsque l’intervention est terminée." />
    <Faq q="Puis-je programmer un dépannage ?" a="Oui. Sélectionnez « Plus tard » au moment de choisir la date de l’intervention." />
    <Faq q="Que se passe-t-il si le dépanneur est indisponible ?" a="La recherche est relancée automatiquement. Vous pouvez aussi programmer l’intervention pour plus tard." />
    <Faq q="Les photos sont-elles obligatoires ?" a="Non. Elles sont facultatives mais peuvent aider à comprendre la panne ou documenter le transport." />
    <Text style={[ui.muted, { textAlign: 'center', marginTop: 12 }]}>Conditions générales • Confidentialité • Mentions légales</Text>
  </AppScreen>;
}
function Faq({ q, a }: { q: string; a: string }) { return <Card><Text style={ui.optionTitle}>{q}</Text><Text style={ui.muted}>{a}</Text></Card>; }

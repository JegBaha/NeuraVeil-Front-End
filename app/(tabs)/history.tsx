import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  TextInput,
  FlatList,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn } from 'react-native-reanimated';


interface Prediction {
  class: string;
  probability: number[];
  imageUri: string;
  modelName: string;
  note: string;
  timestamp: string;
}

const CLASS_LABELS = ['Glioma', 'No Tumor', 'Meningioma', 'Pituitary'];

const History: React.FC = () => {
  const [history, setHistory] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    const loadHistory = async () => {
      try {
        const storedHistory = await AsyncStorage.getItem('predictionHistory');
        if (storedHistory) {
          const parsedHistory: Prediction[] = JSON.parse(storedHistory);
          setHistory(parsedHistory.slice(0, 10)); 
        }
      } catch (error: any) {
        console.error('Failed to load history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, []);


  const resetHistory = async () => {
    try {
      await AsyncStorage.removeItem('predictionHistory');
      setHistory([]);
      console.log('Prediction history cleared.');
    } catch (error: any) {
      console.error('Failed to reset history:', error);
    }
  };


  const updateNote = async (index: number, note: string) => {
    const updatedHistory = [...history];
    updatedHistory[index].note = note;
    setHistory(updatedHistory);

    try {
      await AsyncStorage.setItem('predictionHistory', JSON.stringify(updatedHistory));
    } catch (error: any) {
      console.error('Failed to save note:', error);
    }
  };


  const formatProbabilities = (probabilities: number[]) => {
    if (!probabilities || probabilities.length !== CLASS_LABELS.length) {
      return 'Probabilities could not be calculated.';
    }

    return CLASS_LABELS.map((label, index) => {
      const percentage = (probabilities[index] * 100).toFixed(2);
      return `${label}: ${percentage}%`;
    }).join('\n');
  };

 
  const renderPredictionItem = ({ item, index }: { item: Prediction; index: number }) => (
    <Animated.View entering={FadeIn} style={styles.predictionContainer}>
      <Image source={{ uri: item.imageUri }} style={styles.image} />
      <View style={styles.infoContainer}>
        <Text style={styles.modelText}>Model: {item.modelName}</Text>
        <Text style={styles.timestampText}>
          Tarih: {new Date(item.timestamp).toLocaleString()}
        </Text>
        <Text style={styles.resultTitle}>Tahmin</Text>
        <Text style={styles.resultText}>
          Olasılıklar:{'\n'}{formatProbabilities(item.probability)}
        </Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Not ekle..."
          placeholderTextColor="rgba(55, 71, 79, 0.5)"
          value={item.note}
          onChangeText={(text) => updateNote(index, text)}
          multiline
        />
      </View>
    </Animated.View>
  );

  if (isLoading) {
    return (
      <LinearGradient colors={['#4B79A1', '#283E51']} style={styles.container}>
        <ActivityIndicator size="large" color="#ffffff" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#4B79A1', '#283E51']} style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity style={styles.resetButton} onPress={resetHistory}>
          <Text style={styles.resetButtonText}>Yenile</Text>
        </TouchableOpacity>
      </View>
      {history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Henüz tahmin yapılmadı.</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderPredictionItem}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    zIndex: 1000,
  },
  resetButton: {
    backgroundColor: '#EF5350',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  listContainer: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
  },
  predictionContainer: {
    width: Dimensions.get('window').width * 0.9,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  image: {
    width: 240,
    height: 240,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  infoContainer: {
    width: '100%',
    alignItems: 'center',
  },
  modelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#263238',
    marginBottom: 8,
  },
  timestampText: {
    fontSize: 14,
    color: '#37474F',
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#263238',
    marginBottom: 12,
    textAlign: 'center',
  },
  resultText: {
    fontSize: 16,
    color: '#37474F',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  noteInput: {
    width: '100%',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#263238',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textAlignVertical: 'top',
    minHeight: 80,
  },
});

export default History;
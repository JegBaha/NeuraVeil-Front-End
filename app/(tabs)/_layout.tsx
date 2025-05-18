import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Alert, Platform, ActivityIndicator, Pressable, Modal, FlatList, ScrollView, Switch, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FormDataFile {
  uri: string;
  type: string;
  name: string;
}

interface Prediction {
  class: string;
  probability: number[];
  imageUri?: string;
  modelName?: string;
  note?: string;
  timestamp?: string;
  preprocessFunction?: string;
}

interface ImageSection {
  image: ImagePicker.ImagePickerResult | null;
  prediction: Prediction | null;
  isLoading: boolean;
}

interface BulkPredictionResult {
  glioma: number;
  meningioma: number;
  pituitary: number;
  noTumor: number;
  modelName: string;
  timestamp: string;
  gliomaAccuracy: number;
  meningiomaAccuracy: number;
  pituitaryAccuracy: number;
  noTumorAccuracy: number;
  isGrayscale: boolean;
}

const { width } = Dimensions.get('window');
const SECTION_WIDTH = Math.min(width * 0.45, 280);

const App: React.FC = () => {
  const [sections, setSections] = useState<ImageSection[]>([{ image: null, prediction: null, isLoading: false }]);
  const [layout, setLayout] = useState<string>('1x1');
  const [layoutModalVisible, setLayoutModalVisible] = useState(false);
  const [modelName, setModelName] = useState<string>('Yükleniyor...');
  const [modelNameError, setModelNameError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<string>('150x150');
  const [isGrayscaleEnabled, setIsGrayscaleEnabled] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [bulkImages, setBulkImages] = useState<ImagePicker.ImagePickerResult | null>(null);
  const [bulkPrediction, setBulkPrediction] = useState<BulkPredictionResult | null>(null);
  const [bulkPredictionHistory, setBulkPredictionHistory] = useState<BulkPredictionResult[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const CLASS_LABELS = ['Glioma', 'No Tumor', 'Meningioma', 'Pituitary'];
  const RESOLUTIONS = ['128x128', '150x150', '160x160', '192x192', '224x224', '299x299'];
  const LAYOUTS = ['1x1', '2x1', '3x1', '4x1'];
  const MAX_BULK_IMAGES = 500;

  const SERVER_URL = Platform.OS === 'android' && !Platform.isPad
    ? 'http://10.0.2.2:5000'
    : 'http://192.168.103.162:5000';

  useEffect(() => {
    const fetchModelInfo = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/model-info`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = await response.json();
        if (response.ok) {
          setModelName(data.model_name);
        } else {
          throw new Error(data.error || 'Model adı alınamadı');
        }
      } catch (error: any) {
        setModelNameError(error.message);
        setModelName('Hata');
        setError(`Model adı alınamadı: ${error.message}`);
        Alert.alert('Hata', `Model adı alınamadı: ${error.message}`);
      }
    };

    const fetchModelList = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/model-list`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = await response.json();
        if (response.ok) {
          setAvailableModels(data.models);
        } else {
          throw new Error(data.error || 'Model listesi alınamadı');
        }
      } catch (error: any) {
        setError(`Model listesi alınamadı: ${error.message}`);
        Alert.alert('Hata', `Model listesi alınamadı: ${error.message}`);
      }
    };

    const loadBulkPredictionHistory = async () => {
      try {
        const storedHistory = await AsyncStorage.getItem('bulkPredictionHistory');
        if (storedHistory) {
          setBulkPredictionHistory(JSON.parse(storedHistory));
        }
      } catch (error: any) {
        console.error('Geçmiş yüklenemedi:', error);
      }
    };

    fetchModelInfo();
    fetchModelList();
    loadBulkPredictionHistory();
  }, []);

  const pickImage = async (index: number) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Hata', 'Galeri erişim izni gerekiyor.');
        return;
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled) {
        const newSections = [...sections];
        newSections[index] = { ...newSections[index], image: result, prediction: null };
        setSections([...newSections]);
      }
    } catch (error: any) {
      setError(`Görüntü seçilemedi: ${error.message}`);
      Alert.alert('Hata', `Görüntü seçilemedi: ${error.message}`);
    }
  };

  const pickBulkImages = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Hata', 'Galeri erişim izni gerekiyor.');
        return;
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!result.canceled && result.assets.length > 0) {
        let selectedImages = result;
        if (result.assets.length > MAX_BULK_IMAGES) {
          selectedImages = {
            ...result,
            assets: result.assets.slice(0, MAX_BULK_IMAGES),
          };
          Alert.alert(
            'Bilgi',
            `Maksimum ${MAX_BULK_IMAGES} görüntü sınırı nedeniyle ilk ${MAX_BULK_IMAGES} görüntü seçildi.`
          );
        }
        setBulkImages(selectedImages);
        setEstimatedTime(selectedImages.assets.length * 2);
      }
    } catch (error: any) {
      setError(`Görüntüler seçilemedi: ${error.message}`);
      Alert.alert('Hata', `Görüntüler seçilemedi: ${error.message}`);
    }
  };

  const uploadImage = async (index: number) => {
    const section = sections[index];
    if (!section.image || section.image.canceled) {
      Alert.alert('Hata', 'Lütfen önce bir görüntü seçin.');
      return;
    }

    const newSections = [...sections];
    newSections[index] = { ...newSections[index], isLoading: true, prediction: null };
    setSections([...newSections]);

    const formData = new FormData();
    const asset = section.image.assets[0];

    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      formData.append('file', blob, asset.fileName || 'image.jpg');
      formData.append('isGrayscale', isGrayscaleEnabled.toString());
      formData.append('resolution', selectedResolution);

      console.log(`Bölüm ${index + 1} için görüntü yükleniyor`);
      const fetchResponse = await fetch(`${SERVER_URL}/predict`, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });

      const data = await fetchResponse.json();
      console.log(`Bölüm ${index + 1} için tahmin yanıtı:`, data);

      if (fetchResponse.ok) {
        newSections[index] = {
          ...newSections[index],
          prediction: { ...data, modelName: modelName, preprocessFunction: data.preprocess_function },
          isLoading: false,
        };
        setSections([...newSections]);
        Alert.alert('Başarılı', `Tahmin ${index + 1}: ${data.class}\nPreprocess Fonksiyonu: ${data.preprocess_function}\nOlasılıklar:\n${formatProbabilities(data.probability)}`);

        const newPrediction: Prediction = {
          class: data.class,
          probability: data.probability,
          imageUri: asset.uri,
          modelName: modelName,
          preprocessFunction: data.preprocess_function,
          note: '',
          timestamp: new Date().toISOString(),
        };

        try {
          const storedHistory = await AsyncStorage.getItem('predictionHistory');
          let history: Prediction[] = storedHistory ? JSON.parse(storedHistory) : [];
          history.unshift(newPrediction);
          history = history.slice(0, 10);
          await AsyncStorage.setItem('predictionHistory', JSON.stringify(history));
        } catch (error: any) {
          console.error('Tahmin geçmişi kaydedilemedi:', error);
        }
      } else {
        setError(`Sunucu hatası: ${data.error || 'Bilinmeyen hata'}`);
        Alert.alert('Sunucu Hatası', `Sunucu hatası: ${data.error || 'Bilinmeyen hata'}`);
        newSections[index] = { ...newSections[index], isLoading: false };
        setSections([...newSections]);
      }
    } catch (error: any) {
      setError(`Görüntü yüklenemedi: ${error.message}`);
      Alert.alert('İstek Başarısız', `Görüntü yüklenemedi: ${error.message}`);
      newSections[index] = { ...newSections[index], isLoading: false };
      setSections([...newSections]);
    }
  };

  const processBulkImages = async () => {
    if (!bulkImages || bulkImages.canceled) {
      Alert.alert('Hata', 'Lütfen önce görüntüler seçin.');
      return;
    }

    setBulkLoading(true);
    const results: BulkPredictionResult = {
      glioma: 0,
      meningioma: 0,
      pituitary: 0,
      noTumor: 0,
      modelName: modelName,
      timestamp: new Date().toISOString(),
      gliomaAccuracy: 0,
      meningiomaAccuracy: 0,
      pituitaryAccuracy: 0,
      noTumorAccuracy: 0,
      isGrayscale: isGrayscaleEnabled,
    };

    const accuracies = {
      glioma: [] as number[],
      meningioma: [] as number[],
      pituitary: [] as number[],
      noTumor: [] as number[],
    };

    for (const asset of bulkImages.assets) {
      const formData = new FormData();
      try {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append('file', blob, asset.fileName || 'image.jpg');
        formData.append('isGrayscale', isGrayscaleEnabled.toString());
        formData.append('resolution', selectedResolution);

        const fetchResponse = await fetch(`${SERVER_URL}/predict`, {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' },
        });

        const data = await fetchResponse.json();
        if (fetchResponse.ok) {
          const maxProbability = Math.max(...data.probability);
          switch (data.class) {
            case 'Glioma':
              results.glioma += 1;
              accuracies.glioma.push(maxProbability * 100);
              break;
            case 'Meningioma':
              results.meningioma += 1;
              accuracies.meningioma.push(maxProbability * 100);
              break;
            case 'Pituitary':
              results.pituitary += 1;
              accuracies.pituitary.push(maxProbability * 100);
              break;
            case 'No Tumor':
              results.noTumor += 1;
              accuracies.noTumor.push(maxProbability * 100);
              break;
          }
        }
      } catch (error: any) {
        console.error(`Image upload error: ${error.message}`);
      }
    }

    results.gliomaAccuracy = accuracies.glioma.length > 0 
      ? Number((accuracies.glioma.reduce((a, b) => a + b, 0) / accuracies.glioma.length).toFixed(2))
      : 0;
    results.meningiomaAccuracy = accuracies.meningioma.length > 0 
      ? Number((accuracies.meningioma.reduce((a, b) => a + b, 0) / accuracies.meningioma.length).toFixed(2))
      : 0;
    results.pituitaryAccuracy = accuracies.pituitary.length > 0 
      ? Number((accuracies.pituitary.reduce((a, b) => a + b, 0) / accuracies.pituitary.length).toFixed(2))
      : 0;
    results.noTumorAccuracy = accuracies.noTumor.length > 0 
      ? Number((accuracies.noTumor.reduce((a, b) => a + b, 0) / accuracies.noTumor.length).toFixed(2))
      : 0;

    setBulkPrediction(results);
    setBulkLoading(false);
    setEstimatedTime(0);

    try {
      const storedHistory = await AsyncStorage.getItem('bulkPredictionHistory');
      let history: BulkPredictionResult[] = storedHistory ? JSON.parse(storedHistory) : [];
      history.unshift(results);
      history = history.slice(0, 50);
      await AsyncStorage.setItem('bulkPredictionHistory', JSON.stringify(history));
      setBulkPredictionHistory(history);
    } catch (error: any) {
      console.error('Toplu tahmin geçmişi kaydedilemedi:', error);
    }
  };

  const refreshBulkPredictionHistory = async () => {
    try {
      const storedHistory = await AsyncStorage.getItem('bulkPredictionHistory');
      if (storedHistory) {
        setBulkPredictionHistory(JSON.parse(storedHistory));
      } else {
        setBulkPredictionHistory([]);
      }
    } catch (error: any) {
      console.error('Geçmiş yenilenemedi:', error);
      Alert.alert('Hata', 'Geçmiş yenilenemedi.');
    }
  };

  // Yeni eklenen silme fonksiyonu
  const deleteHistoryItem = async (timestamp: string) => {
    try {
      const updatedHistory = bulkPredictionHistory.filter(item => item.timestamp !== timestamp);
      setBulkPredictionHistory(updatedHistory);
      await AsyncStorage.setItem('bulkPredictionHistory', JSON.stringify(updatedHistory));
    } catch (error: any) {
      console.error('Geçmiş silinemedi:', error);
      Alert.alert('Hata', 'Geçmiş silinemedi.');
    }
  };

  const selectModel = async (modelName: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/set-model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ model_name: modelName }),
      });
      const data = await response.json();
      if (response.ok) {
        setModelName(data.model_name);
        setModelModalVisible(false);
      } else {
        throw new Error(data.error || 'Model ayarlanamadı');
      }
    } catch (error: any) {
      setError(`Model ayarlanamadı: ${error.message}`);
      Alert.alert('Hata', `Model ayarlanamadı: ${error.message}`);
    }
  };

  const selectResolution = (resolution: string) => {
    setSelectedResolution(resolution);
  };

  const selectLayout = (layout: string) => {
    setLayout(layout);
    const numSections = parseInt(layout[0]);
    const newSections = Array(numSections).fill(null).map(() => ({
      image: null,
      prediction: null,
      isLoading: false,
    }));
    setSections([...newSections]);
    setLayoutModalVisible(false);
  };

  const formatProbabilities = (probabilities: number[]) => {
    if (!probabilities || probabilities.length !== CLASS_LABELS.length) {
      return 'Olasılıklar hesaplanamadı.';
    }
    return CLASS_LABELS.map((label, index) => {
      const percentage = (probabilities[index] * 100).toFixed(2);
      return `${label}: %${percentage}`;
    }).join('\n');
  };

  const getHighestProbabilityClass = (probabilities: number[]) => {
    if (!probabilities || probabilities.length !== CLASS_LABELS.length) {
      return 'Bilinmeyen';
    }
    const maxIndex = probabilities.reduce((maxIndex, prob, index, arr) =>
      prob > arr[maxIndex] ? index : maxIndex, 0);
    return CLASS_LABELS[maxIndex];
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const renderModelItem = ({ item }: { item: string }) => (
    <Pressable style={styles.modelItem} onPress={() => selectModel(item)}>
      <Text style={styles.modelItemText}>{item}</Text>
    </Pressable>
  );

  const renderResolutionItem = ({ item }: { item: string }) => (
    <Pressable
      style={[styles.modelItem, item === selectedResolution && styles.selectedResolutionItem]}
      onPress={() => selectResolution(item)}
    >
      <Text style={[styles.modelItemText, item === selectedResolution && styles.selectedResolutionText]}>
        {item}
      </Text>
    </Pressable>
  );

  const renderLayoutItem = ({ item }: { item: string }) => (
    <Pressable style={styles.modelItem} onPress={() => selectLayout(item)}>
      <Text style={styles.modelItemText}>{item}</Text>
    </Pressable>
  );

  // Güncellenmiş renderBulkPredictionItem fonksiyonu
  const renderBulkPredictionItem = ({ item }: { item: BulkPredictionResult }) => (
    <Animated.View entering={FadeIn.duration(500)} style={styles.resultContainer}>
      <View style={styles.historyItemContainer}>
        <View style={styles.historyTextContainer}>
          <Text style={styles.resultTitle}>
            Model: {item.modelName} ({new Date(item.timestamp).toLocaleString()})
          </Text>
          <Text style={styles.resultText}>
            Glioma: {item.glioma} görüntü (%{item.gliomaAccuracy} doğruluk){'\n'}
            Meningioma: {item.meningioma} görüntü (%{item.meningiomaAccuracy} doğruluk){'\n'}
            Pituitary: {item.noTumor} görüntü (%{item.noTumorAccuracy} doğruluk){'\n'}
            No Tumor: {item.pituitary} görüntü (%{item.pituitaryAccuracy} doğruluk){'\n'}
            Grayscale: {item.isGrayscale ? '✅ Evet' : '❌ Hayır'}
          </Text>
        </View>
        <Pressable
          style={styles.deleteButton}
          onPress={() => deleteHistoryItem(item.timestamp)}
        >
          <Text style={styles.deleteButtonText}>✖</Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  if (error) {
    return (
      <View style={[styles.errorContainer, isDarkMode ? darkTheme.errorContainer : lightTheme.errorContainer]}>
        <Text style={[styles.errorText, isDarkMode ? darkTheme.errorText : lightTheme.errorText]}>
          Bir hata oluştu: {error}
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => {
            setError(null);
            setModelName('Yükleniyor...');
            setSections([{ image: null, prediction: null, isLoading: false }]);
            setLayout('1x1');
          }}
        >
          <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
            <Text style={styles.buttonText}>Tekrar Dene</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  return (
    <LinearGradient colors={isDarkMode ? ['#0A0F24', '#1A2238'] : ['#FFFFFF', '#F0F0F0']} style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.titleRow}>
          <Text style={[styles.appTitle, themeStyles.appTitle]}>NeuraVeil</Text>
          <Pressable onPress={toggleDarkMode} style={styles.modeToggleButton}>
            <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.toggleGradient}>
              <Text style={styles.modeToggleText}>{isDarkMode ? '☀️' : '🌙'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
        <Pressable
          style={styles.unleashButton}
          onPress={() => setBulkModalVisible(true)}
        >
          <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
            <Text style={styles.unleashButtonText}>Unleash The Neura</Text>
          </LinearGradient>
        </Pressable>
        <View style={styles.controlsContainer}>
          <Pressable
            style={styles.layoutButton}
            onPress={() => setLayoutModalVisible(true)}
          >
            <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
              <Text style={styles.layoutButtonText}>{layout}</Text>
            </LinearGradient>
          </Pressable>
          <View style={styles.modelNameContainer}>
            <Text style={[styles.modelNameText, themeStyles.modelNameText]}>{modelName}</Text>
            <Pressable
              style={styles.selectModelButton}
              onPress={() => setModelModalVisible(true)}
            >
              <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
                <Text style={styles.selectModelButtonText}>Model Seç</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.sectionsGrid}>
          {sections.map((section, index) => (
            <Animated.View
              key={index}
              entering={ZoomIn.duration(500)}
              style={[styles.sectionContainer, themeStyles.sectionContainer]}
            >
              <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>MRI Bölüm {index + 1}</Text>
              {section.image && !section.image.canceled && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.imageContainer}>
                  <Image source={{ uri: section.image.assets[0].uri }} style={styles.image} />
                  {section.prediction && (
                    <Text
                      style={[styles.predictionLabel, themeStyles.predictionLabel]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      Sonuç: {getHighestProbabilityClass(section.prediction.probability)}
                    </Text>
                  )}
                </Animated.View>
              )}
              <Pressable
                style={[styles.button, section.isLoading && styles.buttonDisabled]}
                onPress={() => pickImage(index)}
                disabled={section.isLoading}
              >
                <LinearGradient
                  colors={section.isLoading ? ['#2A3147', '#2A3147'] : ['#00D4FF', '#BB86FC']}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>Görüntü Seç</Text>
                </LinearGradient>
              </Pressable>
              <View style={styles.toggleContainer}>
                <Text style={[styles.toggleLabel, themeStyles.toggleLabel]}>Grayscale</Text>
                <Switch
                  value={isGrayscaleEnabled}
                  onValueChange={setIsGrayscaleEnabled}
                  thumbColor={isGrayscaleEnabled ? '#00D4FF' : '#2A3147'}
                  trackColor={{ false: '#2A3147', true: '#BB86FC' }}
                />
              </View>
              {section.image && !section.image.canceled && (
                <View style={styles.buttonContainer}>
                  <Pressable
                    style={[styles.button, section.isLoading && styles.buttonDisabled]}
                    onPress={() => uploadImage(index)}
                    disabled={section.isLoading}
                  >
                    <LinearGradient
                      colors={section.isLoading ? ['#2A3147', '#2A3147'] : ['#00D4FF', '#BB86FC']}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>Analiz Et</Text>
                    </LinearGradient>
                  </Pressable>
                  {section.isLoading && (
                    <ActivityIndicator size="large" color="#00D4FF" style={styles.loadingIndicator} />
                  )}
                </View>
              )}
              {section.prediction && (
                <Animated.View entering={FadeIn.duration(500)} style={[styles.resultContainer, themeStyles.resultContainer]}>
                  <Text style={[styles.resultTitle, themeStyles.resultTitle]}>Analiz {index + 1}</Text>
                  <Text style={[styles.resultText, themeStyles.resultText]}>
                    Model:{'\n'} {section.prediction.modelName || 'Bilinmeyen Model'}  {'\n'}
                    Preprocess Fonksiyonu:{'\n'} {section.prediction.preprocessFunction || 'Bilinmeyen'}  {'\n'}
                    Olasılıklar:{'\n'} {formatProbabilities(section.prediction.probability)}
                  </Text>
                </Animated.View>
              )}
            </Animated.View>
          ))}
        </View>
      </ScrollView>
      <Modal
        animationType="fade"
        transparent={true}
        visible={modelModalVisible}
        onRequestClose={() => setModelModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Animated.View entering={ZoomIn.duration(500)} style={[styles.modalContent, themeStyles.modalContent]}>
            <Text style={[styles.modalTitle, themeStyles.modalTitle]}>Model ve Çözünürlük</Text>
            <Text style={[styles.modalSubtitle, themeStyles.modalSubtitle]}>Model</Text>
            {availableModels.length > 0 ? (
              <FlatList
                data={availableModels}
                renderItem={renderModelItem}
                keyExtractor={(item) => item}
                style={styles.modelList}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            ) : (
              <Text style={[styles.noModelsText, themeStyles.noModelsText]}>Model Bulunamadı</Text>
            )}
            <Text style={[styles.modalSubtitle, themeStyles.modalSubtitle]}>Çözünürlük</Text>
            <FlatList
              data={RESOLUTIONS}
              renderItem={renderResolutionItem}
              keyExtractor={(item) => item}
              style={styles.modelList}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
            <Pressable
              style={styles.button}
              onPress={() => setModelModalVisible(false)}
            >
              <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
                <Text style={styles.buttonText}>Kapat</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={layoutModalVisible}
        onRequestClose={() => setLayoutModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Animated.View entering={ZoomIn.duration(500)} style={[styles.modalContent, themeStyles.modalContent]}>
            <Text style={[styles.modalTitle, themeStyles.modalTitle]}>Düzen Seç</Text>
            <FlatList
              data={LAYOUTS}
              renderItem={renderLayoutItem}
              keyExtractor={(item) => item}
              style={styles.modelList}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
            <Pressable
              style={styles.button}
              onPress={() => setLayoutModalVisible(false)}
            >
              <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
                <Text style={styles.buttonText}>Kapat</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={bulkModalVisible}
        onRequestClose={() => setBulkModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Animated.View entering={ZoomIn.duration(500)} style={[styles.modalContent, themeStyles.modalContent]}>
            <Text style={[styles.modalTitle, themeStyles.modalTitle]}>Toplu MRI Analizi</Text>
            <Pressable
              style={styles.button}
              onPress={pickBulkImages}
              disabled={bulkLoading}
            >
              <LinearGradient
                colors={bulkLoading ? ['#2A3147', '#2A3147'] : ['#00D4FF', '#BB86FC']}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>Görüntüleri Seç (Max {MAX_BULK_IMAGES})</Text>
              </LinearGradient>
            </Pressable>
            <View style={styles.toggleContainer}>
              <Text style={[styles.toggleLabel, themeStyles.toggleLabel]}>Grayscale</Text>
              <Switch
                value={isGrayscaleEnabled}
                onValueChange={setIsGrayscaleEnabled}
                thumbColor={isGrayscaleEnabled ? '#00D4FF' : '#2A3147'}
                trackColor={{ false: '#2A3147', true: '#BB86FC' }}
              />
            </View>
            {bulkImages && !bulkImages.canceled && (
              <Text style={[styles.modalSubtitle, themeStyles.modalSubtitle]}>
                {bulkImages.assets.length} görüntü seçildi. Tahmini süre: {estimatedTime} saniye
              </Text>
            )}
            {bulkImages && !bulkImages.canceled && (
              <Pressable
                style={[styles.button, bulkLoading && styles.buttonDisabled]}
                onPress={processBulkImages}
                disabled={bulkLoading}
              >
                <LinearGradient
                  colors={bulkLoading ? ['#2A3147', '#2A3147'] : ['#00D4FF', '#BB86FC']}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>Analiz Et</Text>
                </LinearGradient>
              </Pressable>
            )}
            <Pressable
              style={styles.button}
              onPress={() => setHistoryModalVisible(true)}
              disabled={bulkLoading}
            >
              <LinearGradient
                colors={bulkLoading ? ['#2A3147', '#2A3147'] : ['#00D4FF', '#BB86FC']}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>Geçmiş</Text>
              </LinearGradient>
            </Pressable>
            {bulkLoading && (
              <ActivityIndicator size="large" color="#00D4FF" style={styles.loadingIndicator} />
            )}
            {bulkPrediction && (
              <Animated.View entering={FadeIn.duration(500)} style={[styles.resultContainer, themeStyles.resultContainer]}>
                <Text style={[styles.resultTitle, themeStyles.resultTitle]}>Toplu Analiz Sonuçları</Text>
                <Text style={[styles.resultText, themeStyles.resultText]}>
                  Glioma: {bulkPrediction.glioma} görüntü (%{bulkPrediction.gliomaAccuracy} doğruluk){'\n'}
                  Meningioma: {bulkPrediction.meningioma} görüntü (%{bulkPrediction.meningiomaAccuracy} doğruluk){'\n'}
                  Pituitary: {bulkPrediction.noTumor} görüntü (%{bulkPrediction.noTumorAccuracy} doğruluk){'\n'}
                  No Tumor: {bulkPrediction.pituitary} görüntü (%{bulkPrediction.pituitaryAccuracy} doğruluk)
                </Text>
              </Animated.View>
            )}
            <Pressable
              style={styles.button}
              onPress={() => {
                setBulkModalVisible(false);
                setBulkImages(null);
                setBulkPrediction(null);
                setEstimatedTime(0);
              }}
            >
              <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
                <Text style={styles.buttonText}>Kapat</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={historyModalVisible}
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Animated.View entering={ZoomIn.duration(500)} style={[styles.modalContent, themeStyles.modalContent]}>
            <Text style={[styles.modalTitle, themeStyles.modalTitle]}>Analiz Geçmişi</Text>
            {bulkPredictionHistory.length > 0 ? (
              <FlatList
                data={bulkPredictionHistory}
                renderItem={renderBulkPredictionItem}
                keyExtractor={(item) => item.timestamp}
                style={styles.historyList}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            ) : (
              <Animated.View entering={FadeIn.duration(500)} style={[styles.resultContainer, themeStyles.resultContainer]}>
                <Text style={[styles.resultText, themeStyles.resultText]}>Henüz Analiz Yapılmadı</Text>
              </Animated.View>
            )}
            <Pressable
              style={styles.button}
              onPress={refreshBulkPredictionHistory}
            >
              <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
                <Text style={styles.buttonText}>Yenile</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() => setHistoryModalVisible(false)}
            >
              <LinearGradient colors={['#00D4FF', '#BB86FC']} style={styles.buttonGradient}>
                <Text style={styles.buttonText}>Kapat</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </LinearGradient>
  );
};

const darkTheme = StyleSheet.create({
  appTitle: { color: '#E2E8F0' },
  modelNameText: { color: '#E2E8F0' },
  sectionContainer: { backgroundColor: 'rgba(42, 49, 71, 0.7)' },
  sectionTitle: { color: '#E2E8F0' },
  predictionLabel: { color: '#E2E8F0', backgroundColor: 'rgba(10, 15, 36, 0.9)' },
  toggleLabel: { color: '#E2E8F0' },
  resultContainer: { backgroundColor: 'rgba(42, 49, 71, 0.7)' },
  resultTitle: { color: '#E2E8F0' },
  resultText: { color: '#E2E8F0' },
  modalContent: { backgroundColor: 'rgba(26, 34, 56, 0.95)' },
  modalTitle: { color: '#E2E8F0' },
  modalSubtitle: { color: '#E2E8F0' },
  noModelsText: { color: '#E2E8F0' },
  errorContainer: { backgroundColor: '#0A0F24' },
  errorText: { color: '#FF6B6B' },
});

const lightTheme = StyleSheet.create({
  appTitle: { color: '#0A0F24' },
  modelNameText: { color: '#0A0F24' },
  sectionContainer: { backgroundColor: 'rgba(240, 240, 240, 0.7)' },
  sectionTitle: { color: '#0A0F24' },
  predictionLabel: { color: '#0A0F24', backgroundColor: 'rgba(255, 255, 255, 0.9)' },
  toggleLabel: { color: '#0A0F24' },
  resultContainer: { backgroundColor: 'rgba(240, 240, 240, 0.7)' },
  resultTitle: { color: '#0A0F24' },
  resultText: { color: '#0A0F24' },
  modalContent: { backgroundColor: 'rgba(255, 255, 255, 0.95)' },
  modalTitle: { color: '#0A0F24' },
  modalSubtitle: { color: '#0A0F24' },
  noModelsText: { color: '#0A0F24' },
  errorContainer: { backgroundColor: '#FFFFFF' },
  errorText: { color: '#B00020' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  headerContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 24,
    paddingBottom: 12,
    backgroundColor: 'rgba(26, 34, 56, 0.7)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 212, 255, 0.2)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 12,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(0, 212, 255, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  modeToggleButton: {
    marginLeft: 12,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  toggleGradient: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleText: {
    fontSize: 24,
  },
  unleashButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 12,
  },
  unleashButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E2E8F0',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
  },
  layoutButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  layoutButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E2E8F0',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  modelNameContainer: {
    backgroundColor: 'rgba(42, 49, 71, 0.7)',
    borderRadius: 24,
    padding: 12,
    shadowColor: '#BB86FC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
  },
  modelNameText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(187, 134, 252, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  selectModelButton: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  selectModelButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#E2E8F0',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  scrollContainer: {
    padding: 24,
    paddingTop: 120,
  },
  sectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sectionContainer: {
    width: SECTION_WIDTH,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(0, 212, 255, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  imageContainer: {
    position: 'relative',
    width: SECTION_WIDTH - 40,
    height: SECTION_WIDTH - 40,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#BB86FC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  predictionLabel: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  button: {
    borderRadius: 24,
    overflow: 'hidden',
    marginVertical: 12,
    width: '100%',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  buttonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  loadingIndicator: {
    marginLeft: 16,
  },
  resultContainer: {
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(187, 134, 252, 0.2)',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(187, 134, 252, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  resultText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalContent: {
    width: '85%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#BB86FC',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(0, 212, 255, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  modalSubtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(187, 134, 252, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  modelList: {
    maxHeight: 220,
    marginBottom: 20,
  },
  historyList: {
    maxHeight: 420,
    marginBottom: 20,
  },
  modelItem: {
    backgroundColor: '#2A3147',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginVertical: 4,
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  selectedResolutionItem: {
    backgroundColor: '#BB86FC',
  },
  modelItemText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E2E8F0',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  selectedResolutionText: {
    color: '#0A0F24',
  },
  noModelsText: {
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    width: '100%',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: 16,
    marginRight: 12,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textShadowColor: 'rgba(0, 212, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  // Yeni eklenen stiller
  historyItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  historyTextContainer: {
    flex: 1,
  },
  deleteButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 16,
    padding: 8,
    marginLeft: 12,
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#E2E8F0',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default App;
'use client';

/**
 * Fody - React Native aplikace pro OSMCZ
 * (C) Michal Schneider and OSMCZ, 2026
 *
 * Kompletni mobilni klient pro praci s Fody API
 * Kompatibilni s Expo Go
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
  Linking,
  Modal,
  FlatList,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

// Konstanty
const FODY_API_BASE = 'https://osm.fit.vutbr.cz/fody';
const AUTH_URL = 'https://osm.fit.vutbr.cz/fody/auth2.php';
const OSM_MAP_URL = 'https://openstreetmap.cz/#map=11/49.9601/14.2367&layers=dAKVGB';
const DISCORD_URL = 'https://discord.gg/A9eRVaRzRe';
const PROJECT_MONTH_URL = 'https://fluffini.cz/projektmesice.txt';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Barvy aplikace
const COLORS = {
  primary: '#2E7D32',
  primaryDark: '#1B5E20',
  primaryLight: '#81C784',
  secondary: '#1565C0',
  accent: '#FF6F00',
  background: '#F5F5F5',
  surface: '#FFFFFF',
  text: '#212121',
  textSecondary: '#757575',
  error: '#D32F2F',
  success: '#388E3C',
  warning: '#F57C00',
  border: '#E0E0E0',
  disabled: '#BDBDBD',
  userLocation: '#2196F3',
};

// Ikony (SVG jako komponenty nebo Unicode)
const Icons = {
  camera: '📷',
  map: '🗺️',
  info: 'ℹ️',
  upload: '⬆️',
  photo: '🖼️',
  location: '📍',
  refresh: '🔄',
  stats: '📊',
  discord: '💬',
  web: '🌐',
  close: '✕',
  check: '✓',
  warning: '⚠️',
  grid: '▦',
  list: '☰',
  search: '🔍',
  filter: '⚙️',
  back: '←',
  forward: '→',
  user: '👤',
  calendar: '📅',
  tag: '🏷️',
  login: '🔑',
  logout: '🚪',
};

// ============================================
// AUTORIZACE - OAuth2 pres OSM
// ============================================

const AuthContext = React.createContext({
  user: null,
  isLoggedIn: false,
  login: () => {},
  logout: () => {},
});

const useAuth = () => React.useContext(AuthContext);

// ============================================
// KOMPONENTY
// ============================================

// Header komponenta
const Header = ({ title, subtitle, rightComponent }) => (
  <View style={styles.header}>
    <View style={styles.headerContent}>
      <Text style={styles.headerTitle}>{title}</Text>
      {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
    </View>
    {rightComponent && <View style={styles.headerRight}>{rightComponent}</View>}
  </View>
);

// Karta komponenta
const Card = ({ children, style, onPress }) => {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
  }
  return content;
};

// Button komponenta
const Button = ({ title, onPress, variant = 'primary', icon, disabled, loading, style }) => {
  const buttonStyles = [
    styles.button,
    variant === 'primary' && styles.buttonPrimary,
    variant === 'secondary' && styles.buttonSecondary,
    variant === 'outline' && styles.buttonOutline,
    variant === 'danger' && styles.buttonDanger,
    disabled && styles.buttonDisabled,
    style,
  ];
  
  const textStyles = [
    styles.buttonText,
    variant === 'outline' && styles.buttonTextOutline,
    disabled && styles.buttonTextDisabled,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? COLORS.primary : '#FFF'} />
      ) : (
        <View style={styles.buttonContent}>
          {icon && <Text style={styles.buttonIcon}>{icon}</Text>}
          <Text style={textStyles}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Badge komponenta
const Badge = ({ text, variant = 'default' }) => {
  const badgeStyles = [
    styles.badge,
    variant === 'success' && styles.badgeSuccess,
    variant === 'warning' && styles.badgeWarning,
    variant === 'error' && styles.badgeError,
    variant === 'info' && styles.badgeInfo,
  ];
  
  return (
    <View style={badgeStyles}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
};

// Statistika komponenta
const StatCard = ({ title, value, icon, color }) => (
  <Card style={[styles.statCard, { borderLeftColor: color || COLORS.primary }]}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={[styles.statValue, { color: color || COLORS.primary }]}>{value}</Text>
    <Text style={styles.statTitle}>{title}</Text>
  </Card>
);

// Photo Grid Item
const PhotoGridItem = ({ photo, onPress }) => (
  <TouchableOpacity style={styles.photoGridItem} onPress={() => onPress(photo)} activeOpacity={0.8}>
    <Image
      source={{ uri: `${FODY_API_BASE}/files/250px/${photo.id}.jpg` }}
      style={styles.photoGridImage}
      resizeMode="cover"
    />
    <View style={styles.photoGridOverlay}>
      <Text style={styles.photoGridId}>#{photo.id}</Text>
    </View>
  </TouchableOpacity>
);

// Photo Detail Modal
const PhotoDetailModal = ({ visible, photo, onClose }) => {
  if (!photo) return null;
  
  const properties = photo.properties || {};
  
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Fotka #{properties.id}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>{Icons.close}</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContent}>
          <Image
            source={{ uri: `${FODY_API_BASE}/files/${properties.id}.jpg` }}
            style={styles.modalImage}
            resizeMode="contain"
          />
          
          <View style={styles.modalInfo}>
            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>{Icons.user} Autor:</Text>
              <Text style={styles.modalInfoValue}>{properties.author || 'Neznamy'}</Text>
            </View>
            
            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>{Icons.calendar} Vytvoreno:</Text>
              <Text style={styles.modalInfoValue}>{properties.created || 'Nezname'}</Text>
            </View>
            
            {properties.ref && String(properties.ref) !== 'none' && String(properties.ref).trim() !== '' && (
              <View style={styles.modalInfoRow}>
                <Text style={styles.modalInfoLabel}>{Icons.tag} Reference:</Text>
                <Text style={styles.modalInfoValue}>{String(properties.ref)}</Text>
              </View>
            )}
            
            {properties.tags && (
              <View style={styles.modalInfoRow}>
                <Text style={styles.modalInfoLabel}>{Icons.tag} Tagy:</Text>
                <Text style={styles.modalInfoValue}>{properties.tags}</Text>
              </View>
            )}
            
            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>{Icons.location} Souradnice:</Text>
              <Text style={styles.modalInfoValue}>
                {photo.geometry?.coordinates 
                  ? `${photo.geometry.coordinates[1].toFixed(6)}, ${photo.geometry.coordinates[0].toFixed(6)}`
                  : 'Nezname'}
              </Text>
            </View>
            
            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>Stav:</Text>
              <Badge 
                text={properties.enabled === 't' || properties.enabled === true ? 'Aktivni' : 'Neaktivni'} 
                variant={properties.enabled === 't' || properties.enabled === true ? 'success' : 'warning'} 
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// Login Modal pro OAuth2
const LoginModal = ({ visible, onClose, onLoginSuccess }) => {
  const webViewRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const handleNavigationStateChange = (navState) => {
    // Kontrola jestli jsme se uspesne přihlásili
    // auth2.php presmeruje zpet po uspesnem přihláseni

      // Uspesne přihláseni - zkusime ziskat info o uzivateli
      checkLoginStatus();
    
  };

const checkLoginStatus = async () => {
  try {
    const response = await fetch(`${FODY_API_BASE}/api.php?cmd=logged`, {
      credentials: 'include',
    });

    if (response.ok) { // response.ok je true, když status je 200–299
      const text = await response.text(); // pokud potřebuješ obsah
      onLoginSuccess(text.trim());
      onClose();
    } else {
      console.error('Chyba při přihlášení, status:', response.status);
      // tady můžeš zobrazit zprávu uživateli podle statusu
      // např. 401 = Unauthorized, 403 = Forbidden
    }
  } catch (error) {
    console.error('Chyba při kontrole přihlášení:', error);
  }
};


  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.loginModalContainer}>
        <View style={styles.loginModalHeader}>
          <Text style={styles.loginModalTitle}>přihláseni pres OSM</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>{Icons.close}</Text>
          </TouchableOpacity>
        </View>
        
        {loading && (
          <View style={styles.loginLoading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loginLoadingText}>Nacitam přihláseni...</Text>
          </View>
        )}
        
        <WebView
          ref={webViewRef}
          source={{ uri: `${AUTH_URL}?login&back_url=?` }}
          style={[styles.loginWebView, loading && { opacity: 0 }]}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={handleNavigationStateChange}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
      </SafeAreaView>
    </Modal>
  );
};

// ============================================
// HLAVNI OBRAZOVKY
// ============================================

// FODY TAB - Hlavni funkcionalita
const FodyTab = ({ onNavigateToMapUpload }) => {
  const { user, isLoggedIn, login, logout } = useAuth();
  const [photos, setPhotos] = useState([]);
  const [stats, setStats] = useState(null);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('browse');

  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadLocation, setUploadLocation] = useState(null);
  const [selectedTag, setSelectedTag] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  // Nacteni fotek z API
  const fetchPhotos = useCallback(async (limit = 50) => {
    try {
      setLoading(true);
      const response = await fetch(`${FODY_API_BASE}/api.php?cmd=show&limit=${limit}`);
      const data = await response.json();
      if (data.features) {
        setPhotos(data.features);
      }
    } catch (error) {
      console.error('Chyba pri nacitani fotek:', error);
      Alert.alert('Chyba', 'nepodařilo se nacist fotky ze serveru.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Nacteni tagu z API
  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch(`${FODY_API_BASE}/api.php?cmd=tags`);
      const data = await response.json();
      setTags(data);
    } catch (error) {
      console.error('Chyba pri nacitani tagu:', error);
    }
  }, []);

  // Nacteni statistik
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${FODY_API_BASE}/verify.php?stats`);
      const text = await response.text();
      const parts = text.split(':');
      if (parts.length >= 5) {
        setStats({
          needVerify: parseInt(parts[0]) || 0,
          verified: parseInt(parts[1]) || 0,
          enabled: parseInt(parts[2]) || 0,
          disabled: parseInt(parts[3]) || 0,
          total: parseInt(parts[4]) || 0,
        });
      }
    } catch (error) {
      console.error('Chyba pri nacitani statistik:', error);
    }
  }, []);

  // Refresh funkce
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchPhotos(), fetchStats(), fetchTags()]);
    setRefreshing(false);
  }, [fetchPhotos, fetchStats, fetchTags]);

  // Inicializace
  useEffect(() => {
    fetchPhotos();
    fetchStats();
    fetchTags();
  }, [fetchPhotos, fetchStats, fetchTags]);

  // Otevreni detailu fotky
  const openPhotoDetail = (photo) => {
    setSelectedPhoto(photo);
    setModalVisible(true);
  };

  // Filtrovane fotky - OPRAVA: osetrit undefined hodnoty
  const filteredPhotos = photos.filter(photo => {
    if (!searchQuery) return true;
    const props = photo.properties || {};
    const searchLower = searchQuery.toLowerCase();
    
    const id = props.id != null ? String(props.id) : '';
    const author = props.author != null ? String(props.author).toLowerCase() : '';
    const tagsStr = props.tags != null ? String(props.tags).toLowerCase() : '';
    const refStr = props.ref != null ? String(props.ref).toLowerCase() : '';
    
    return (
      id.includes(searchLower) ||
      author.includes(searchLower) ||
      tagsStr.includes(searchLower) ||
      refStr.includes(searchLower)
    );
  });

  // Sekce prohlizeni fotek
  const renderBrowseSection = () => (
    <>
      {/* Vyhledavani */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>{Icons.search}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Hledat podle ID, autora, tagu..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={COLORS.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearSearch}>{Icons.close}</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('grid')}
          >
            <Text style={styles.viewToggleIcon}>{Icons.grid}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('list')}
          >
            <Text style={styles.viewToggleIcon}>{Icons.list}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Grid/List fotek */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Nacitam fotky...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPhotos}
          keyExtractor={(item) => String(item.properties?.id || Math.random())}
          numColumns={viewMode === 'grid' ? 3 : 1}
          key={viewMode}
          renderItem={({ item }) => 
            viewMode === 'grid' ? (
              <PhotoGridItem photo={item.properties} onPress={() => openPhotoDetail(item)} />
            ) : (
              <TouchableOpacity 
                style={styles.photoListItem} 
                onPress={() => openPhotoDetail(item)}
              >
                <Image
                  source={{ uri: `${FODY_API_BASE}/files/250px/${item.properties?.id}.jpg` }}
                  style={styles.photoListImage}
                />
                <View style={styles.photoListInfo}>
                  <Text style={styles.photoListId}>#{item.properties?.id}</Text>
                  <Text style={styles.photoListAuthor}>{item.properties?.author || 'Neznamy'}</Text>
                  <Text style={styles.photoListDate}>{item.properties?.created}</Text>
                  {item.properties?.tags && (
                    <Text style={styles.photoListTags} numberOfLines={1}>{item.properties.tags}</Text>
                  )}
                </View>
              </TouchableOpacity>
            )
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
          }
          contentContainerStyle={styles.photoListContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{Icons.photo}</Text>
              <Text style={styles.emptyText}>Zadne fotky k zobrazeni</Text>
            </View>
          }
        />
      )}
    </>
  );

  // Sekce nahrávání fotek
  const renderUploadSection = () => {
    const pickImage = async () => {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Opravneni', 'Pro nahrani fotek je potreba opravneni ke galerii.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        exif: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
        
        // Zkusit ziskat GPS z EXIF
        if (result.assets[0].exif) {
          const exif = result.assets[0].exif;
          if (exif.GPSLatitude && exif.GPSLongitude) {
            setUploadLocation({
              latitude: exif.GPSLatitude,
              longitude: exif.GPSLongitude,
            });
          }
        }
      }
    };

    const takePhoto = async () => {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Opravneni', 'Pro porizeni fotky je potreba opravneni ke kamere.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        exif: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
        
        // Ziskat aktualni polohu
        const locPermission = await Location.requestForegroundPermissionsAsync();
        if (locPermission.granted) {
          const loc = await Location.getCurrentPositionAsync({});
          setUploadLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      }
    };

    const getCurrentLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Opravneni', 'Pro získani polohy je potřeba oprávnění.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setUploadLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      Alert.alert('Poloha získana', `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
    };

    const uploadPhoto = async () => {
      if (!isLoggedIn) {
        Alert.alert('přihláseni', 'Pro nahrání fotek je potřeba se přihlásit přes OSM účet.', [
          { text: 'Zrusit', style: 'cancel' },
          { text: 'přihlásit se', onPress: login },
        ]);
        return;
      }
      
      if (!selectedImage) {
        Alert.alert('Chyba', 'Vyberte prosím fotku.');
        return;
      }
      if (!uploadLocation) {
        Alert.alert('Chyba', 'Je potřeba zadat souřadnice.');
        return;
      }
      if (!selectedTag) {
        Alert.alert('Chyba', 'Vyberte prosím typ objektu.');
        return;
      }

      setUploading(true);

      try {
        const formData = new FormData();
        formData.append('uploadedfile', {
          uri: selectedImage.uri,
          type: 'image/jpeg',
          name: 'photo.jpg',
        });
        formData.append('cmd', 'add');
        formData.append('lat', String(uploadLocation.latitude));
        formData.append('lon', String(uploadLocation.longitude));
        formData.append('gp_type', selectedTag);
        if (reference) formData.append('ref', reference);
        if (note) formData.append('note', note);

        const response = await fetch(`${FODY_API_BASE}/api.php`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          credentials: 'include',
        });

        const result = await response.text();
        
        if (response.ok && result.startsWith('1')) {
          Alert.alert('Uspech', 'Fotka byla úspěěně nahrána!');
          setSelectedImage(null);
          setUploadLocation(null);
          setSelectedTag('');
          setReference('');
          setNote('');
          fetchPhotos();
          fetchStats();
        } else {
          Alert.alert('Chyba', `nahrávání selhalo: ${result}`);
        }
      } catch (error) {
        console.error('Chyba pri nahrávání:', error);
        Alert.alert('Chyba', 'nepodařilo se nahrát fotku. Zkontrolujte připojení a přihláseni.');
      } finally {
        setUploading(false);
      }
    };

    return (
      <ScrollView style={styles.uploadContainer} contentContainerStyle={styles.uploadContent}>
        {/* přihláseni */}
        {!isLoggedIn && (
          <Card style={styles.loginPromptCard}>
            <Text style={styles.loginPromptIcon}>{Icons.login}</Text>
            <Text style={styles.loginPromptTitle}>přihlaste se pro nahrávání</Text>
            <Text style={styles.loginPromptText}>Pro nahrávání fotek je potřeba přihlášení pres OpenStreetMap účet.</Text>
            <Button
              title="přihlásit se pres OSM"
              icon={Icons.login}
              onPress={login}
              style={{ marginTop: 12 }}
            />
          </Card>
        )}

        <Card style={styles.uploadCard}>
          <Text style={styles.uploadTitle}>{Icons.camera} Nahrát novou fotku</Text>
          
          <View style={styles.uploadButtons}>
            <Button
              title="Vyfotit"
              icon={Icons.camera}
              onPress={takePhoto}
              style={styles.uploadBtn}
            />
            <Button
              title="Z galerie"
              icon={Icons.photo}
              onPress={pickImage}
              variant="secondary"
              style={styles.uploadBtn}
            />
          </View>

          {selectedImage && (
            <View style={styles.selectedImageContainer}>
              <Image source={{ uri: selectedImage.uri }} style={styles.selectedImage} />
              <TouchableOpacity 
                style={styles.removeImageBtn}
                onPress={() => setSelectedImage(null)}
              >
                <Text style={styles.removeImageText}>{Icons.close}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.uploadForm}>
            <Text style={styles.uploadLabel}>{Icons.location} Souradnice</Text>
            <View style={styles.locationRow}>
              <TextInput
                style={[styles.uploadInput, styles.locationInput]}
                placeholder="Lat"
                value={uploadLocation?.latitude?.toFixed(6) || ''}
                onChangeText={(text) => setUploadLocation(prev => ({ ...prev, latitude: parseFloat(text) || 0 }))}
                keyboardType="numeric"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TextInput
                style={[styles.uploadInput, styles.locationInput]}
                placeholder="Lon"
                value={uploadLocation?.longitude?.toFixed(6) || ''}
                onChangeText={(text) => setUploadLocation(prev => ({ ...prev, longitude: parseFloat(text) || 0 }))}
                keyboardType="numeric"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TouchableOpacity style={styles.gpsBtn} onPress={getCurrentLocation}>
                <Text style={styles.gpsBtnText}>{Icons.location}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.mapSelectBtn}
              onPress={() => onNavigateToMapUpload()}
            >
              <Text style={styles.mapSelectBtnIcon}>{Icons.map}</Text>
              <Text style={styles.mapSelectBtnText}>Vybrat pozici na mape</Text>
            </TouchableOpacity>

            <Text style={styles.uploadLabel}>{Icons.tag} Typ objektu *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScroll}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag.id}
                  style={[styles.tagChip, selectedTag === tag.name && styles.tagChipSelected]}
                  onPress={() => setSelectedTag(tag.name)}
                >
                  <Text style={[styles.tagChipText, selectedTag === tag.name && styles.tagChipTextSelected]}>
                    {tag.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.uploadLabel}>Reference (cislo, kod)</Text>
            <TextInput
              style={styles.uploadInput}
              placeholder="napr. 12345"
              value={reference}
              onChangeText={setReference}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.uploadLabel}>Poznamka</Text>
            <TextInput
              style={[styles.uploadInput, styles.uploadTextarea]}
              placeholder="Volitelny popis..."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Button
              title={uploading ? 'Nahrávám...' : 'Nahrát fotku'}
              icon={Icons.upload}
              onPress={uploadPhoto}
              loading={uploading}
              disabled={!selectedImage || !uploadLocation || !selectedTag || !isLoggedIn}
              style={styles.uploadSubmitBtn}
            />
          </View>
        </Card>

        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>{Icons.info} Informace k nahrávání</Text>
          <Text style={styles.infoText}>
            {'\u2022'} Fotka musi byt ve formatu JPEG{'\n'}
            {'\u2022'} Minimalni velikost: 100 KB{'\n'}
            {'\u2022'} Musí obsahovat EXIF datum pořízení{'\n'}
            {'\u2022'} Pro nahrávání je potřeba přihláseni OSM účtem
          </Text>
        </Card>
      </ScrollView>
    );
  };

  // Sekce statistik
  const renderStatsSection = () => (
    <ScrollView 
      style={styles.statsContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
      }
    >
      <Text style={styles.sectionTitle}>{Icons.stats} Statistiky Fody</Text>
      
      {stats ? (
        <View style={styles.statsGrid}>
          <StatCard
            title="Celkem fotek"
            value={stats.total.toLocaleString()}
            icon={Icons.photo}
            color={COLORS.primary}
          />
          <StatCard
            title="Aktivnich"
            value={stats.enabled.toLocaleString()}
            icon={Icons.check}
            color={COLORS.success}
          />
          <StatCard
            title="Overenych"
            value={stats.verified.toLocaleString()}
            icon={Icons.check}
            color={COLORS.secondary}
          />
          <StatCard
            title="Ceka na overeni"
            value={stats.needVerify.toLocaleString()}
            icon={Icons.warning}
            color={COLORS.warning}
          />
          <StatCard
            title="Zakazanych"
            value={stats.disabled.toLocaleString()}
            icon={Icons.close}
            color={COLORS.error}
          />
          <StatCard
            title="% overenych"
            value={`${((stats.verified / stats.total) * 100).toFixed(1)}%`}
            icon={Icons.stats}
            color={COLORS.accent}
          />
        </View>
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Nacitam statistiky...</Text>
        </View>
      )}

      {/* Dostupne tagy */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{Icons.tag} Dostupne typy objektu</Text>
      <Card style={styles.tagsCard}>
        {tags.map((tag) => (
          <View key={tag.id} style={styles.tagItem}>
            <View style={styles.tagHeader}>
              <Text style={styles.tagName}>{tag.name}</Text>
              {tag.ref === 1 && <Badge text="Vyzaduje ref" variant="info" />}
            </View>
            {tag.describe && <Text style={styles.tagDescribe}>{tag.describe}</Text>}
            {tag.secondary && tag.secondary.length > 0 && (
              <View style={styles.secondaryTags}>
                {tag.secondary.map((sec) => (
                  <View key={sec.id} style={styles.secondaryTag}>
                    <Text style={styles.secondaryTagName}>{sec.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );

  return (
    <View style={styles.tabContent}>
      {/* Navigace sekci */}
      <View style={styles.sectionNav}>
        <TouchableOpacity
          style={[styles.sectionNavItem, activeSection === 'browse' && styles.sectionNavItemActive]}
          onPress={() => setActiveSection('browse')}
        >
          <Text style={[styles.sectionNavText, activeSection === 'browse' && styles.sectionNavTextActive]}>
            {Icons.photo} Prohlížet
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionNavItem, activeSection === 'upload' && styles.sectionNavItemActive]}
          onPress={() => setActiveSection('upload')}
        >
          <Text style={[styles.sectionNavText, activeSection === 'upload' && styles.sectionNavTextActive]}>
            {Icons.upload} Nahrát
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionNavItem, activeSection === 'stats' && styles.sectionNavItemActive]}
          onPress={() => setActiveSection('stats')}
        >
          <Text style={[styles.sectionNavText, activeSection === 'stats' && styles.sectionNavTextActive]}>
            {Icons.stats} Statistiky
          </Text>
        </TouchableOpacity>
      </View>

      {/* Obsah sekce */}
      {activeSection === 'browse' && renderBrowseSection()}
      {activeSection === 'upload' && renderUploadSection()}
      {activeSection === 'stats' && renderStatsSection()}

      {/* Modal detailu fotky */}
      <PhotoDetailModal
        visible={modalVisible}
        photo={selectedPhoto}
        onClose={() => {
          setModalVisible(false);
          setSelectedPhoto(null);
        }}
      />
    </View>
  );
};

// MAPA TAB - OSM mapa s moznosti nahrávání, polohou uzivatele a rozcesniky
const MapTab = ({ uploadMode: externalUploadMode, onLocationSelected, onUploadComplete }) => {
  const { isLoggedIn, login } = useAuth();
  const webViewRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploadMode, setUploadMode] = useState(externalUploadMode || false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedMarkerInfo, setSelectedMarkerInfo] = useState(null);
  
  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadImage, setUploadImage] = useState(null);
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPhotosForMap();
    fetchTags();
    getUserLocation();
  }, []);

  useEffect(() => {
    if (externalUploadMode !== undefined) {
      setUploadMode(externalUploadMode);
      if (webViewRef.current && mapLoaded) {
        webViewRef.current.injectJavaScript(`window.setUploadMode(${externalUploadMode}); true;`);
      }
    }
  }, [externalUploadMode, mapLoaded]);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        
        // Poslat polohu do mapy
        if (webViewRef.current && mapLoaded) {
          webViewRef.current.injectJavaScript(`
            window.setUserLocation(${location.coords.latitude}, ${location.coords.longitude});
            true;
          `);
        }
      }
    } catch (error) {
      console.error('Chyba pri ziskavani polohy:', error);
    }
  };

  const fetchPhotosForMap = async (bounds = null) => {
    try {
      setLoadingPhotos(true);
      let url = `${FODY_API_BASE}/api.php?cmd=show&limit=500`;
      if (bounds) {
        url += `&bbox=${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
      }
      const response = await fetch(url);
      const data = await response.json();
      if (data.features) {
        setPhotos(data.features);
        
        // Poslat fotky do mapy
        if (webViewRef.current && mapLoaded) {
          webViewRef.current.injectJavaScript(`
            window.updatePhotos(${JSON.stringify(data.features)});
            true;
          `);
        }
      }
    } catch (error) {
      console.error('Chyba pri nacitani fotek pro mapu:', error);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch(`${FODY_API_BASE}/api.php?cmd=tags`);
      const data = await response.json();
      setTags(data);
    } catch (error) {
      console.error('Chyba pri nacitani tagu:', error);
    }
  };

  // HTML pro Leaflet mapu s polohou uzivatele a rozcesniky
  const mapHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    #map { width: 100%; height: 100%; }
    .photo-marker {
      width: 24px;
      height: 24px;
      background: #2E7D32;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .user-marker {
      width: 20px;
      height: 20px;
      background: #2196F3;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(33,150,243,0.5);
    }
    .user-marker-pulse {
      position: absolute;
      width: 40px;
      height: 40px;
      background: rgba(33,150,243,0.3);
      border-radius: 50%;
      animation: pulse 2s infinite;
      top: -10px;
      left: -10px;
    }
    @keyframes pulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }
    .upload-marker {
      width: 32px;
      height: 32px;
      background: #FF6F00;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      cursor: crosshair;
    }
    .leaflet-popup-content {
      margin: 8px;
      text-align: center;
      min-width: 180px;
    }
    .leaflet-popup-content img {
      max-width: 200px;
      max-height: 150px;
      border-radius: 4px;
    }
    .popup-title {
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .popup-info {
      font-size: 12px;
      color: #666;
    }
    .popup-tags {
      font-size: 11px;
      color: #888;
      margin-top: 4px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map').setView([49.9601, 14.2367], 11);
    
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '(C) <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    var photoIcon = L.divIcon({
      className: 'photo-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    var userIcon = L.divIcon({
      className: '',
      html: '<div class="user-marker-pulse"></div><div class="user-marker"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    var uploadIcon = L.divIcon({
      className: 'upload-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    var uploadMarker = null;
    var userMarker = null;
    var uploadMode = false;
    var photoMarkers = [];

    // Funkce pro aktualizaci fotek na mape
    window.updatePhotos = function(photos) {
      // Odstranit stare markery
      photoMarkers.forEach(function(marker) {
        map.removeLayer(marker);
      });
      photoMarkers = [];
      
      // Pridat nove markery
      photos.forEach(function(photo) {
        if (photo.geometry && photo.geometry.coordinates) {
          var coords = [photo.geometry.coordinates[1], photo.geometry.coordinates[0]];
          var marker = L.marker(coords, { icon: photoIcon }).addTo(map);
          var props = photo.properties || {};
          
          var popupContent = '<div class="popup-title">#' + props.id + '</div>' +
            '<img src="https://osm.fit.vutbr.cz/fody/files/250px/' + props.id + '.jpg" onerror="this.style.display=\\'none\\'" />' +
            '<div class="popup-info">' + (props.author || 'Neznamy') + '</div>' +
            '<div class="popup-info">' + (props.created || '') + '</div>' +
            (props.tags ? '<div class="popup-tags">' + props.tags + '</div>' : '');
          
          marker.bindPopup(popupContent);
          
          marker.on('click', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'markerClick',
              photo: props
            }));
          });
          
          photoMarkers.push(marker);
        }
      });
    };

    // Nastaveni polohy uzivatele
    window.setUserLocation = function(lat, lon) {
      if (userMarker) {
        map.removeLayer(userMarker);
      }
      userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);
      userMarker.bindPopup('<b>Vase poloha</b>');
    };

    // Centrovani na polohu uzivatele
    window.centerOnUser = function() {
      if (userMarker) {
        map.setView(userMarker.getLatLng(), 15);
      }
    };

    // Klik na mapu pro nahrani
    map.on('click', function(e) {
      if (uploadMode) {
        if (uploadMarker) {
          map.removeLayer(uploadMarker);
        }
        uploadMarker = L.marker(e.latlng, { icon: uploadIcon }).addTo(map);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'locationSelected',
          lat: e.latlng.lat,
          lon: e.latlng.lng
        }));
      }
    });

    // Nacitani fotek pri posunu mapy
    var loadTimeout = null;
    map.on('moveend', function() {
      clearTimeout(loadTimeout);
      loadTimeout = setTimeout(function() {
        var bounds = map.getBounds();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'boundsChanged',
          bounds: {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest()
          }
        }));
      }, 500);
    });

    // Funkce pro prepnuti rezimu nahrávání
    window.setUploadMode = function(mode) {
      uploadMode = mode;
      if (!mode && uploadMarker) {
        map.removeLayer(uploadMarker);
        uploadMarker = null;
      }
    };

    // Inicialni nacteni
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapLoaded' }));
  </script>
</body>
</html>
  `;

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'mapLoaded') {
        setMapLoaded(true);
        // Poslat polohu uzivatele pokud ji mame
        if (userLocation) {
          webViewRef.current?.injectJavaScript(`
            window.setUserLocation(${userLocation.latitude}, ${userLocation.longitude});
            true;
          `);
        }
        // Nacist fotky
        fetchPhotosForMap();
      } else if (data.type === 'locationSelected') {
        setSelectedLocation({ latitude: data.lat, longitude: data.lon });
        
        if (onLocationSelected) {
          onLocationSelected({ latitude: data.lat, longitude: data.lon });
        } else {
          // Zobrazit dialog pro nahrani přímo z mapy
          Alert.alert(
            'Poloha vybrana',
            `Lat: ${data.lat.toFixed(6)}\nLon: ${data.lon.toFixed(6)}`,
            [
              { text: 'Zrusit', style: 'cancel' },
              { 
                text: 'Nahrát fotku zde', 
                onPress: () => {
                  if (!isLoggedIn) {
                    Alert.alert('přihláseni', 'Pro nahrani fotek je potreba se přihlásit.', [
                      { text: 'Zrusit', style: 'cancel' },
                      { text: 'přihlásit se', onPress: login },
                    ]);
                    return;
                  }
                  setShowUploadModal(true);
                }
              },
            ]
          );
        }
      } else if (data.type === 'boundsChanged') {
        // Nacist fotky pro novou oblast (na pozadi)
        fetchPhotosForMap(data.bounds);
      } else if (data.type === 'markerClick') {
        setSelectedMarkerInfo(data.photo);
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  };

  const toggleUploadMode = () => {
    const newMode = !uploadMode;
    setUploadMode(newMode);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.setUploadMode(${newMode}); true;`);
    }
  };

  const centerOnUserLocation = () => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.centerOnUser(); true;`);
    }
  };

  const pickImageForUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Opravneni', 'Pro nahrani fotek je potreba opravneni ke galerii.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      exif: true,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadImage(result.assets[0]);
    }
  };

  const takePhotoForUpload = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Opravneni', 'Pro porizeni fotky je potreba opravneni ke kamere.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
      exif: true,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadImage(result.assets[0]);
    }
  };

  const uploadPhotoFromMap = async () => {
    if (!uploadImage) {
      Alert.alert('Chyba', 'Vyberte prosím fotku.');
      return;
    }
    if (!selectedLocation) {
      Alert.alert('Chyba', 'Pozice není vybrana.');
      return;
    }
    if (!selectedTag) {
      Alert.alert('Chyba', 'Vyberte prosím typ objektu.');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('uploadedfile', {
        uri: uploadImage.uri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      });
      formData.append('cmd', 'add');
      formData.append('lat', String(selectedLocation.latitude));
      formData.append('lon', String(selectedLocation.longitude));
      formData.append('gp_type', selectedTag);
      if (reference) formData.append('ref', reference);
      if (note) formData.append('note', note);

      const response = await fetch(`${FODY_API_BASE}/api.php`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        credentials: 'include',
      });

      const result = await response.text();
      
      if (response.ok && result.startsWith('1')) {
        Alert.alert('Uspech', 'Fotka byla uspesne nahrana!');
        setShowUploadModal(false);
        setUploadImage(null);
        setSelectedTag('');
        setReference('');
        setNote('');
        setUploadMode(false);
        webViewRef.current?.injectJavaScript(`window.setUploadMode(false); true;`);
        fetchPhotosForMap();
        if (onUploadComplete) onUploadComplete();
      } else {
        Alert.alert('Chyba', `nahrávání selhalo: ${result}`);
      }
    } catch (error) {
      console.error('Chyba pri nahrávání:', error);
      Alert.alert('Chyba', 'nepodařilo se nahrát fotku.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.mapContainer}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHTML }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={true}
      />
      
      {/* Ovladani mapy */}
      <View style={styles.mapControls}>
        <TouchableOpacity
          style={[styles.mapControlBtn, uploadMode && styles.mapControlBtnActive]}
          onPress={toggleUploadMode}
        >
          <Text style={styles.mapControlIcon}>{uploadMode ? Icons.close : Icons.camera}</Text>
          <Text style={[styles.mapControlText, uploadMode && styles.mapControlTextActive]}>
            {uploadMode ? 'Zrusit' : 'Nahrát zde'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={centerOnUserLocation}
        >
          <Text style={styles.mapControlIcon}>{Icons.location}</Text>
          <Text style={styles.mapControlText}>Moje poloha</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={() => Linking.openURL(OSM_MAP_URL)}
        >
          <Text style={styles.mapControlIcon}>{Icons.web}</Text>
          <Text style={styles.mapControlText}>OSM.cz</Text>
        </TouchableOpacity>
      </View>

      {uploadMode && (
        <View style={styles.uploadModeOverlay}>
          <Text style={styles.uploadModeText}>
            {Icons.location} Klikněte na mapu pro výběr pozice nahrání
          </Text>
        </View>
      )}

      {loadingPhotos && (
        <View style={styles.mapLoadingPhotos}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}

      {!mapLoaded && (
        <View style={styles.mapLoading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.mapLoadingText}>Načítám mapu...</Text>
        </View>
      )}

      {/* Upload Modal přímo z mapy */}
      <Modal visible={showUploadModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nahrát fotku</Text>
            <TouchableOpacity onPress={() => setShowUploadModal(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>{Icons.close}</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent} contentContainerStyle={{ padding: 16 }}>
            <Card style={{ marginBottom: 16 }}>
              <Text style={styles.uploadLabel}>{Icons.location} Vybraná pozice</Text>
              <Text style={{ fontSize: 14, color: COLORS.text }}>
                Lat: {selectedLocation?.latitude?.toFixed(6)}, Lon: {selectedLocation?.longitude?.toFixed(6)}
              </Text>
            </Card>

            <View style={styles.uploadButtons}>
              <Button
                title="Vyfotit"
                icon={Icons.camera}
                onPress={takePhotoForUpload}
                style={styles.uploadBtn}
              />
              <Button
                title="Z galerie"
                icon={Icons.photo}
                onPress={pickImageForUpload}
                variant="secondary"
                style={styles.uploadBtn}
              />
            </View>

            {uploadImage && (
              <View style={styles.selectedImageContainer}>
                <Image source={{ uri: uploadImage.uri }} style={styles.selectedImage} />
                <TouchableOpacity 
                  style={styles.removeImageBtn}
                  onPress={() => setUploadImage(null)}
                >
                  <Text style={styles.removeImageText}>{Icons.close}</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.uploadLabel}>{Icons.tag} Typ objektu *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScroll}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag.id}
                  style={[styles.tagChip, selectedTag === tag.name && styles.tagChipSelected]}
                  onPress={() => setSelectedTag(tag.name)}
                >
                  <Text style={[styles.tagChipText, selectedTag === tag.name && styles.tagChipTextSelected]}>
                    {tag.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.uploadLabel}>Reference</Text>
            <TextInput
              style={styles.uploadInput}
              placeholder="napr. 12345"
              value={reference}
              onChangeText={setReference}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.uploadLabel}>Poznámka</Text>
            <TextInput
              style={[styles.uploadInput, styles.uploadTextarea]}
              placeholder="Volitelny popis..."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Button
              title={uploading ? 'Nahrávam...' : 'Nahrát fotku'}
              icon={Icons.upload}
              onPress={uploadPhotoFromMap}
              loading={uploading}
              disabled={!uploadImage || !selectedTag}
              style={styles.uploadSubmitBtn}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

// VICE TAB - Info, odkazy, projekt mesice
const MoreTab = () => {
  const { user, isLoggedIn, login, logout } = useAuth();
  const [projectMonth, setProjectMonth] = useState('Nacitam...');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjectMonth();
  }, []);

  const fetchProjectMonth = async () => {
    try {
      const response = await fetch(PROJECT_MONTH_URL);
      const text = await response.text();
      setProjectMonth(text.trim() || 'Momentalne není aktivní projekt čtvrtletí.');
    } catch (error) {
      console.error('Chyba pri načítáni projektu čtvrtletí:', error);
      setProjectMonth('nepodařilo se načíst aktuální projekt čtvrtletí.');
    } finally {
      setLoading(false);
    }
  };

  const openLink = (url) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Chyba', 'nepodařilo se otevrit odkaz.');
    });
  };

  return (
    <ScrollView style={styles.moreContainer} contentContainerStyle={styles.moreContent}>
      {/* přihláseni */}
      <Card style={styles.userCard}>
        <View style={styles.userCardHeader}>
          <Text style={styles.userIcon}>{Icons.user}</Text>
          <View style={styles.userCardInfo}>
            {isLoggedIn ? (
              <>
                <Text style={styles.userCardTitle}>přihlášen jako</Text>
                <Text style={styles.userCardName}>{user}</Text>
              </>
            ) : (
              <>
                <Text style={styles.userCardTitle}>Nepřihlášeno</Text>
                <Text style={styles.userCardSubtitle}>přihlaste se pro nahrávání</Text>
              </>
            )}
          </View>
        </View>
        {isLoggedIn ? (
          <Button
            title="Odhlasit se"
            icon={Icons.logout}
            variant="outline"
            onPress={logout}
          />
        ) : (
          <Button
            title="přihlásit se pres OSM"
            icon={Icons.login}
            onPress={login}
          />
        )}
      </Card>

      {/* Projekt ctvrtleti */}
      <Card style={styles.projectCard}>
        <View style={styles.projectHeader}>
          <Text style={styles.projectIcon}>{Icons.calendar}</Text>
          <Text style={styles.projectTitle}>Projekt čtvrtletí</Text>
        </View>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />
        ) : (
          <Text style={styles.projectText}>{projectMonth}</Text>
        )}
        <Button
          title="Zjistit vice"
          variant="outline"
          onPress={() => openLink('https://fluffini.cz/projektmesice.txt')}
          style={{ marginTop: 12 }}
        />
      </Card>

      {/* Odkazy */}
      <Text style={styles.sectionHeader}>{Icons.web} Užitečné odkazy</Text>
      
      <Card style={styles.linkCard} onPress={() => openLink(DISCORD_URL)}>
        <Text style={styles.linkIcon}>{Icons.discord}</Text>
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle}>Discord komunita</Text>
          <Text style={styles.linkSubtitle}>Připojte se k diskuzi s ostatními mapery</Text>
        </View>
        <Text style={styles.linkArrow}>{Icons.forward}</Text>
      </Card>

      <Card style={styles.linkCard} onPress={() => openLink(OSM_MAP_URL)}>
        <Text style={styles.linkIcon}>{Icons.map}</Text>
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle}>OpenStreetMap.cz</Text>
          <Text style={styles.linkSubtitle}>Oficiální český portál OSM</Text>
        </View>
        <Text style={styles.linkArrow}>{Icons.forward}</Text>
      </Card>

      <Card style={styles.linkCard} onPress={() => openLink('https://osm.fit.vutbr.cz/fody/')}>
        <Text style={styles.linkIcon}>{Icons.web}</Text>
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle}>Fody web</Text>
          <Text style={styles.linkSubtitle}>Webové rozhraní fotodatabáze</Text>
        </View>
        <Text style={styles.linkArrow}>{Icons.forward}</Text>
      </Card>

      <Card style={styles.linkCard} onPress={() => openLink('https://openstreetmap.org')}>
        <Text style={styles.linkIcon}>{Icons.map}</Text>
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle}>OpenStreetMap.org</Text>
          <Text style={styles.linkSubtitle}>Hlavní stranka projektu OSM</Text>
        </View>
        <Text style={styles.linkArrow}>{Icons.forward}</Text>
      </Card>

      {/* O aplikaci */}
      <Text style={styles.sectionHeader}>{Icons.info} O aplikaci</Text>
      
      <Card style={styles.aboutCard}>
        <View style={styles.aboutHeader}>
          <Text style={styles.aboutLogo}>{Icons.camera}</Text>
          <View>
            <Text style={styles.aboutTitle}>Fody</Text>
            <Text style={styles.aboutVersion}>Verze 1.0.1</Text>
          </View>
        </View>
        
        <Text style={styles.aboutDescription}>
          Fody je aplikace pro správu a nahrávání fotografií infrastruktury pro projekt OpenStreetMap. 
          Pomocí této aplikace můžete prohlížet, nahrávat a spravovat fotografie geodetických bodu, 
          veřejné dopravy, památek a dalších objektů zájmu. Zaměřujeme se hlavně na rozcestníky, informační tabule, body záchrany apod.
        </Text>

        <View style={styles.aboutFeatures}>
          <Text style={styles.aboutFeatureTitle}>Hlavni funkce:</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Prohlížení fotek z databáze Fody</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Nahráváni nových fotografií</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Interaktivní mapa s fotkami</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Statistiky a přehledy</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Podpora GPS souřadnic z EXIF</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Nahraváni přímo z mapy</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.copyright}>
          (C) Michal Schneider and OSMCZ, 2026
        </Text>
        <Text style={styles.license}>
          Licencováno pod GNU GPL v2
        </Text>
        <Text style={styles.credits}>
          Založeno na Fody API od Tomáše Kašpárka
        </Text>
      </Card>

      {/* Technicke info */}
      <Card style={styles.techCard}>
        <Text style={styles.techTitle}>Technické informace</Text>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>API Server:</Text>
          <Text style={styles.techValue}>osm.fit.vutbr.cz</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>Platforma:</Text>
          <Text style={styles.techValue}>React Native / Expo</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>Mapa:</Text>
          <Text style={styles.techValue}>Leaflet + OSM Mapnik</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>Autorizace:</Text>
          <Text style={styles.techValue}>OAuth2 (OSM)</Text>
        </View>
      </Card>
    </ScrollView>
  );
};

// ============================================
// HLAVNI APLIKACE
// ============================================

export default function App() {
  const [activeTab, setActiveTab] = useState('fody');
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginModalVisible, setLoginModalVisible] = useState(false);

  const login = () => {
    setLoginModalVisible(true);
  };

  const logout = async () => {
    try {
      // Zavolat logout endpoint
      await fetch(`${AUTH_URL}?logout`, { credentials: 'include' });
      setUser(null);
      setIsLoggedIn(false);
      Alert.alert('Odhlaseno', 'Byli jste uspesne odhlaseni.');
    } catch (error) {
      console.error('Chyba pri odhlaseni:', error);
    }
  };

  const handleLoginSuccess = (username) => {
    setUser(username);
    setIsLoggedIn(true);
    setLoginModalVisible(false);
    Alert.alert('přihláseno', `Vitejte, ${username}!`);
  };

  const navigateToMapUpload = () => {
    setActiveTab('map');
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, login, logout }}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
        
        {/* Header */}
        <Header
          title="Fody"
          subtitle={
            activeTab === 'fody' ? 'Fotodatabaze' :
            activeTab === 'map' ? 'Mapa' :
            'Vice'
          }
          rightComponent={
            isLoggedIn ? (
              <View style={styles.headerUserBadge}>
                <Text style={styles.headerUserIcon}>{Icons.user}</Text>
                <Text style={styles.headerUserName} numberOfLines={1}>{user}</Text>
              </View>
            ) : null
          }
        />

        {/* Obsah */}
        <View style={styles.content}>
          {activeTab === 'fody' && <FodyTab onNavigateToMapUpload={navigateToMapUpload} />}
          {activeTab === 'map' && <MapTab />}
          {activeTab === 'more' && <MoreTab />}
        </View>

        {/* Spodni navigace */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'fody' && styles.tabItemActive]}
            onPress={() => setActiveTab('fody')}
          >
            <Text style={[styles.tabIcon, activeTab === 'fody' && styles.tabIconActive]}>
              {Icons.camera}
            </Text>
            <Text style={[styles.tabLabel, activeTab === 'fody' && styles.tabLabelActive]}>
              Fody
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'map' && styles.tabItemActive]}
            onPress={() => setActiveTab('map')}
          >
            <Text style={[styles.tabIcon, activeTab === 'map' && styles.tabIconActive]}>
              {Icons.map}
            </Text>
            <Text style={[styles.tabLabel, activeTab === 'map' && styles.tabLabelActive]}>
              Mapa
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'more' && styles.tabItemActive]}
            onPress={() => setActiveTab('more')}
          >
            <Text style={[styles.tabIcon, activeTab === 'more' && styles.tabIconActive]}>
              {Icons.info}
            </Text>
            <Text style={[styles.tabLabel, activeTab === 'more' && styles.tabLabelActive]}>
              Vice
            </Text>
          </TouchableOpacity>
        </View>

        {/* Login Modal */}
        <LoginModal
          visible={loginModalVisible}
          onClose={() => setLoginModalVisible(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      </SafeAreaView>
    </AuthContext.Provider>
  );
}

// ============================================
// STYLY
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },

  // Header
  header: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    marginLeft: 16,
  },
  headerUserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight + '30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerUserIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  headerUserName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    maxWidth: 80,
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabItemActive: {},
  tabIcon: {
    fontSize: 24,
    marginBottom: 2,
  },
  tabIconActive: {},
  tabLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  // Button
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonPrimary: {
    backgroundColor: COLORS.primary,
  },
  buttonSecondary: {
    backgroundColor: COLORS.secondary,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  buttonDanger: {
    backgroundColor: COLORS.error,
  },
  buttonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextOutline: {
    color: COLORS.primary,
  },
  buttonTextDisabled: {
    color: '#FFFFFF',
  },

  // Badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  badgeSuccess: {
    backgroundColor: '#C8E6C9',
  },
  badgeWarning: {
    backgroundColor: '#FFE0B2',
  },
  badgeError: {
    backgroundColor: '#FFCDD2',
  },
  badgeInfo: {
    backgroundColor: '#BBDEFB',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Tab Content
  tabContent: {
    flex: 1,
  },

  // Section Nav
  sectionNav: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionNavItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  sectionNavItemActive: {
    backgroundColor: COLORS.primaryLight + '30',
  },
  sectionNavText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  sectionNavTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  clearSearch: {
    fontSize: 16,
    color: COLORS.textSecondary,
    padding: 4,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 2,
  },
  viewToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: COLORS.surface,
  },
  viewToggleIcon: {
    fontSize: 16,
  },

  // Photo Grid
  photoListContainer: {
    padding: 4,
  },
  photoGridItem: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.border,
    maxWidth: (SCREEN_WIDTH - 16) / 3,
  },
  photoGridImage: {
    width: '100%',
    height: '100%',
  },
  photoGridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  photoGridId: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },

  // Photo List
  photoListItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginHorizontal: 8,
    marginVertical: 4,
    overflow: 'hidden',
  },
  photoListImage: {
    width: 100,
    height: 100,
  },
  photoListInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  photoListId: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  photoListAuthor: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 2,
  },
  photoListDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  photoListTags: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalCloseBtn: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  modalContent: {
    flex: 1,
  },
  modalImage: {
    width: '100%',
    height: 300,
    backgroundColor: COLORS.background,
  },
  modalInfo: {
    padding: 16,
  },
  modalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalInfoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    width: 120,
  },
  modalInfoValue: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },

  // Login Modal
  loginModalContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  loginModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  loginModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  loginWebView: {
    flex: 1,
  },
  loginLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    zIndex: 1,
  },
  loginLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  loginPromptCard: {
    alignItems: 'center',
    backgroundColor: COLORS.warning + '15',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  loginPromptIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  loginPromptTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  loginPromptText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Upload
  uploadContainer: {
    flex: 1,
  },
  uploadContent: {
    padding: 12,
  },
  uploadCard: {
    marginBottom: 12,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  uploadButtons: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  uploadBtn: {
    flex: 1,
    marginHorizontal: 4,
  },
  selectedImageContainer: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  selectedImage: {
    width: '100%',
    height: 200,
    backgroundColor: COLORS.background,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  uploadForm: {},
  uploadLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 12,
  },
  uploadInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  uploadTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationInput: {
    flex: 1,
    marginRight: 8,
  },
  gpsBtn: {
    backgroundColor: COLORS.primary,
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsBtnText: {
    fontSize: 20,
  },
  mapSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary + '15',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  mapSelectBtnIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  mapSelectBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  tagsScroll: {
    flexGrow: 0,
  },
  tagChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tagChipText: {
    fontSize: 14,
    color: COLORS.text,
  },
  tagChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  uploadSubmitBtn: {
    marginTop: 24,
  },
  infoCard: {
    backgroundColor: COLORS.primaryLight + '20',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },

  // Stats
  statsContainer: {
    flex: 1,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  statCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    marginHorizontal: 6,
    marginBottom: 12,
    borderLeftWidth: 4,
    alignItems: 'center',
    paddingVertical: 20,
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  tagsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  tagItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tagName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  tagDescribe: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  secondaryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  secondaryTag: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  secondaryTagName: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },

  // Map
  mapContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
  },
  mapControlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  mapControlBtnActive: {
    backgroundColor: COLORS.accent,
  },
  mapControlIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  mapControlText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  mapControlTextActive: {
    color: '#FFFFFF',
  },
  uploadModeOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadModeText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  mapLoadingPhotos: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: COLORS.surface,
    padding: 8,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  // More Tab
  moreContainer: {
    flex: 1,
  },
  moreContent: {
    padding: 12,
  },
  userCard: {
    marginBottom: 16,
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  userIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  userCardInfo: {
    flex: 1,
  },
  userCardTitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  userCardName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  userCardSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  projectCard: {
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  projectTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  projectText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    marginTop: 8,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  linkIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  linkContent: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  linkSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  linkArrow: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  aboutCard: {
    marginBottom: 12,
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  aboutLogo: {
    fontSize: 48,
    marginRight: 16,
  },
  aboutTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
  },
  aboutVersion: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  aboutDescription: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 16,
  },
  aboutFeatures: {
    marginBottom: 16,
  },
  aboutFeatureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  aboutFeature: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  copyright: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  license: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  credits: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  techCard: {
    marginBottom: 24,
  },
  techTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  techRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  techLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  techValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
  },
});

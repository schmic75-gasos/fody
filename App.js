'use client';

/**
 * Fody - React Native aplikace pro OSMCZ
 * (C) Michal Schneider and OSMCZ, 2026
 *
 * Kompletni mobilni klient pro praci s Fody API
 * Kompatibilni s Expo Go
 * 
 * @version 1.1.5
 * @license 0BSD OR Apache-2.0 OR CC0-1.0 OR MIT OR Unlicense
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Animated,
  Easing,
  PanResponder,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Konstanty
const FODY_API_BASE = 'https://osm.fit.vut.cz/fody';
const AUTH_URL = 'https://osm.fit.vut.cz/fody/auth2.php';
const OSM_MAP_URL = 'https://openstreetmap.cz/#map=11/49.9601/14.2367&layers=dAKVGB';
const DISCORD_URL = 'https://discord.gg/A9eRVaRzRe';
const PROJECT_MONTH_API_URL = 'https://xn--eicha-hcbb.fun/api/1/project-of-the-month.json';
const OSM_API_BASE = 'https://api.openstreetmap.org/api/0.6';
const OSM_NOTES_API = 'https://api.openstreetmap.org/api/0.6/notes';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const GITHUB_URL = 'https://codeberg.org/osmcz/fody-app';

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
  noteOpen: '#FF5722',
  noteClosed: '#4CAF50',
};

// Ikony kategorie pro mapu
const CATEGORY_ICONS = {
  rozcestnik: '🚶',
  infotabule: '📋',
  mapa: '🗺️',
  zastavka: '🚏',
  emergency: '🆘',
  pesi: '🚶',
  cyklo: '🚴',
  silnicni: '🚗',
  konska: '🐎',
  lyzarska: '⛷️',
  vozickar: '♿',
  memorial: '🏛️',
  panorama: '🌄',
  zahranicni: '🌍',
  necitelne: '❓',
  default: '📍',
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
  compass: '🧭',
  note: '📝',
  noteOpen: '🟠',
  noteClosed: '🟢',
  layers: '📚',
  table: '📊',
  github: '💻',
  expand: '⤢',
  settings: '⚙️',
  download: '⬇️',
  fullscreen: '⛶',
};

// ============================================
// CUSTOM SLIDER COMPONENT
// ============================================
const CustomSlider = ({ value, onValueChange, minimumValue = 10, maximumValue = 1000, step = 10 }) => {
  const trackWidth = 280;
  const thumbX = ((value - minimumValue) / (maximumValue - minimumValue)) * trackWidth;
  const [isDragging, setIsDragging] = useState(false);

  const handleSliderPress = (event) => {
    const { locationX } = event.nativeEvent;
    const newX = Math.max(0, Math.min(trackWidth, locationX));
    const newValue = Math.round((newX / trackWidth) * (maximumValue - minimumValue) / step) * step + minimumValue;
    onValueChange(Math.min(maximumValue, Math.max(minimumValue, newValue)));
  };

  const handleResponderStart = () => {
    setIsDragging(true);
  };

  const handleResponderEnd = () => {
    setIsDragging(false);
  };

  return (
    <View style={styles.customSliderContainer}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleSliderPress}
        onPressIn={handleResponderStart}
        onPressOut={handleResponderEnd}
        style={[styles.customSliderTrack, isDragging && styles.customSliderTrackActive]}
      >
        <View style={[styles.customSliderFilled, { width: thumbX }]} />
        <View
          style={[
            styles.customSliderThumb,
            { left: thumbX - 10 },
            isDragging && styles.customSliderThumbActive
          ]}
        />
      </TouchableOpacity>
    </View>
  );
};

// ============================================
// AUTORIZACE - OAuth2 pres OSM
// ============================================

const AuthContext = React.createContext({
  user: null,
  isLoggedIn: false,
  login: () => {},
  logout: () => {},
  osmAccessToken: null,
});

const useAuth = () => React.useContext(AuthContext);

// ============================================
// HELPER FUNCTIONS
// ============================================

// Parse tagy do kategorie
const getCategoryFromTags = (tagsString) => {
  if (!tagsString) return 'default';
  const tags = tagsString.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (tags.includes(key)) return key;
  }
  return 'default';
};

// Overpass query builder
const buildOverpassQuery = (lat, lon, radius = 50) => {
  return `
    [out:json][timeout:25];
    (
      node(around:${radius},${lat},${lon});
      way(around:${radius},${lat},${lon});
    );
    out body;
    >;
    out skel qt;
  `;
};

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
const PhotoGridItem = ({ photo, onPress, onAuthorPress }) => (
  <TouchableOpacity 
    key={`photo-${photo.id}`}
    style={styles.photoGridItem} 
    onPress={() => onPress(photo)} 
    activeOpacity={0.8}
  >
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

// OSM Tags Table komponenta
const OSMTagsTable = ({ lat, lon, visible, onClose }) => {
  const [tags, setTags] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchOSMTags = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildOverpassQuery(lat, lon, 30);
      const response = await fetch(OVERPASS_API, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      const data = await response.json();
      if (data.elements && data.elements.length > 0) {
        // Najdi nejblizsi prvek s tagy
        const elementWithTags = data.elements.find(el => el.tags && Object.keys(el.tags).length > 0);
        if (elementWithTags) {
          setTags(elementWithTags.tags);
        } else {
          setTags({});
        }
      } else {
        setTags({});
      }
    } catch (err) {
      console.error('Error fetching OSM tags:', err);
      setError('Nepodařilo se načíst OSM tagy');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.tagsTableContainer}>
      <View style={styles.tagsTableHeader}>
        <Text style={styles.tagsTableTitle}>{Icons.table} OSM Tagy</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.tagsTableClose}>{Icons.close}</Text>
        </TouchableOpacity>
      </View>
      
      {!tags && !loading && !error && (
        <Button
          title="Načíst OSM tagy"
          icon={Icons.refresh}
          onPress={fetchOSMTags}
          variant="outline"
          style={{ marginVertical: 8 }}
        />
      )}

      {loading && (
        <View style={styles.tagsTableLoading}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.tagsTableLoadingText}>Načítám z Overpass API...</Text>
        </View>
      )}

      {error && (
        <Text style={styles.tagsTableError}>{error}</Text>
      )}

      {tags && Object.keys(tags).length === 0 && (
        <Text style={styles.tagsTableEmpty}>Žádné tagy nenalezeny v okolí</Text>
      )}

      {tags && Object.keys(tags).length > 0 && (
        <ScrollView style={styles.tagsTableScroll}>
          {Object.entries(tags).map(([key, value]) => (
            <View key={key} style={styles.tagsTableRow}>
              <Text style={styles.tagsTableKey}>{key}</Text>
              <Text style={styles.tagsTableValue}>{value}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

// Fullscreen Photo Modal
const FullscreenPhotoModal = ({ visible, photoId, onClose }) => {
  if (!photoId) return null;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={styles.fullscreenPhotoContainer}>
        <View style={styles.fullscreenPhotoHeader}>
          <TouchableOpacity onPress={onClose} style={styles.fullscreenPhotoCloseBtn}>
            <Text style={styles.fullscreenPhotoCloseText}>{Icons.close}</Text>
          </TouchableOpacity>
          <Text style={styles.fullscreenPhotoTitle}>Fotka #{photoId}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.fullscreenPhotoContent}>
          <Image
            source={{ uri: `${FODY_API_BASE}/files/${photoId}.jpg` }}
            style={styles.fullscreenPhotoImage}
            resizeMode="contain"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// Photo Detail Modal with expanded features
const PhotoDetailModal = ({ visible, photo, onClose, onAuthorPress }) => {
  const [showTags, setShowTags] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!photo) return null;

  const properties = photo.properties || {};
  const coords = photo.geometry?.coordinates;

  const downloadPhoto = async () => {
    try {
      setDownloading(true);
      const fileName = `Fody_${properties.id}.jpg`;
      const fileUri = FileSystem.documentDirectory + fileName;

      const downloadResult = await FileSystem.downloadAsync(
        `${FODY_API_BASE}/files/${properties.id}.jpg`,
        fileUri
      );

      if (downloadResult.status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'image/jpeg',
            dialogTitle: `Uložit fotku ${fileName}`,
          });
        } else {
          Alert.alert('Úspěch', `Fotka byla stažena do: ${fileName}`);
        }
      }
    } catch (error) {
      console.error('Chyba při stahování fotky:', error);
      Alert.alert('Chyba', 'Nepodařilo se stáhnout fotku');
    } finally {
      setDownloading(false);
    }
  };

  
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
              <TouchableOpacity onPress={() => onAuthorPress && onAuthorPress(properties.author)}>
                <Text style={[styles.modalInfoValue, styles.modalAuthorLink]}>
                  {properties.author || 'Neznámý'}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>{Icons.calendar} Vytvořeno:</Text>
              <Text style={styles.modalInfoValue}>{properties.created || 'Neznámé'}</Text>
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
              <Text style={styles.modalInfoLabel}>{Icons.location} Souřadnice:</Text>
              <Text style={styles.modalInfoValue}>
                {coords
                  ? `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
                  : 'Neznámé'}
              </Text>
            </View>
            
            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>Stav:</Text>
              <Badge
                text={properties.enabled === 't' || properties.enabled === true ? 'Aktivní' : 'Neaktivní'}
                variant={properties.enabled === 't' || properties.enabled === true ? 'success' : 'warning'}
              />
            </View>

            {/* Action buttons */}
            <View style={styles.photoActionButtons}>
              <Button
                title="Fullscreen"
                icon={Icons.fullscreen}
                variant="secondary"
                onPress={() => setFullscreenVisible(true)}
                style={styles.photoActionButton}
              />
              <Button
                title={downloading ? 'Stahování...' : 'Stáhnout'}
                icon={Icons.download}
                onPress={downloadPhoto}
                loading={downloading}
                disabled={downloading}
                style={styles.photoActionButton}
              />
            </View>

            {/* OSM Tags section */}
            {coords && (
              <View style={styles.osmTagsSection}>
                <TouchableOpacity 
                  style={styles.osmTagsToggle}
                  onPress={() => setShowTags(!showTags)}
                >
                  <Text style={styles.osmTagsToggleText}>
                    {Icons.table} {showTags ? 'Skrýt OSM tagy' : 'Zobrazit OSM tagy'}
                  </Text>
                </TouchableOpacity>
                
                <OSMTagsTable 
                  lat={coords[1]} 
                  lon={coords[0]} 
                  visible={showTags}
                  onClose={() => setShowTags(false)}
                />
              </View>
            )}
          </View>
        </ScrollView>

        {/* Fullscreen Photo Modal */}
        <FullscreenPhotoModal
          visible={fullscreenVisible}
          photoId={properties.id}
          onClose={() => setFullscreenVisible(false)}
        />
      </SafeAreaView>
    </Modal>
  );
};

// User Profile Modal - zobrazeni vsech fotek uzivatele
const UserProfileModal = ({ visible, username, onClose }) => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoDetailVisible, setPhotoDetailVisible] = useState(false);

  useEffect(() => {
    if (visible && username) {
      fetchUserPhotos();
    }
  }, [visible, username]);

  const fetchUserPhotos = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${FODY_API_BASE}/api.php?cmd=show&limit=1000`);
      const data = await response.json();
      if (data.features) {
      const userPhotos = data.features.filter(p => {
  const author = p.properties?.author;
  return (
    typeof author === 'string' &&
    author.toLowerCase() === username?.toLowerCase()
  );
});
        setPhotos(userPhotos);
      }
    } catch (error) {
      console.error('Error fetching user photos:', error);
      Alert.alert('Chyba', 'Nepodařilo se načíst fotky uživatele.');
    } finally {
      setLoading(false);
    }
  };

  const openPhotoDetail = (photo) => {
    setSelectedPhoto(photo);
    setPhotoDetailVisible(true);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{Icons.user} {username}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>{Icons.close}</Text>
          </TouchableOpacity>
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Načítám fotky uživatele...</Text>
          </View>
        ) : (
          <FlatList
            data={photos}
            keyExtractor={(item) => `user-photo-${item.properties?.id || Math.random()}`}
            numColumns={3}
            renderItem={({ item, index }) => (
              <PhotoGridItem 
                key={`user-photo-item-${item.properties?.id || index}`}
                photo={item.properties} 
                onPress={() => openPhotoDetail(item)} 
              />
            )}
            contentContainerStyle={styles.photoListContainer}
            ListHeaderComponent={
              <View style={styles.userProfileStats}>
                <Text style={styles.userProfileStatsText}>
                  Celkem fotek: {photos.length}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>{Icons.photo}</Text>
                <Text style={styles.emptyText}>Žádné fotky od tohoto uživatele</Text>
              </View>
            }
          />
        )}

        <PhotoDetailModal
          visible={photoDetailVisible}
          photo={selectedPhoto}
          onClose={() => {
            setPhotoDetailVisible(false);
            setSelectedPhoto(null);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
};

// Panoramax Viewer Modal
const PanoramaxViewerModal = ({ visible, panoramaxId, sequenceId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [interactiveUrl, setInteractiveUrl] = useState('');

  useEffect(() => {
    if (visible && panoramaxId) {
      loadPanoramaxData();
    }
  }, [visible, panoramaxId]);

  const loadPanoramaxData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Zkontrolujeme, zda máme ID
      if (!panoramaxId) {
        throw new Error('Chybí ID panoramax fotky');
      }

      // Sestavíme URL pro náhled
      const imgUrl = `https://panoramax.openstreetmap.fr/derivates/${panoramaxId}/sd.jpg`;
      setImageUrl(imgUrl);

      // Sestavíme URL pro interaktivní prohlížení
      let interactive = `https://api.panoramax.xyz/?focus=pic&pic=${panoramaxId}`;
      if (sequenceId) {
        interactive += `&seq=${sequenceId}`;
      }
      setInteractiveUrl(interactive);

    } catch (err) {
      console.error('Chyba při načítání Panoramax:', err);
      setError(err.message || 'Nepodařilo se načíst Panoramax data');
    } finally {
      setLoading(false);
    }
  };

  const openInBrowser = () => {
    if (interactiveUrl) {
      Linking.openURL(interactiveUrl).catch(() => {
        Alert.alert('Chyba', 'Nepodařilo se otevřít prohlížeč');
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{Icons.compass} Panoramax</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>{Icons.close}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} contentContainerStyle={{ padding: 16 }}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Načítám Panoramax...</Text>
            </View>
          ) : error ? (
            <Card style={[styles.infoCard, { backgroundColor: COLORS.error + '15' }]}>
              <Text style={[styles.infoTitle, { color: COLORS.error }]}>
                {Icons.warning} Chyba
              </Text>
              <Text style={styles.infoText}>{error}</Text>
            </Card>
          ) : (
            <>
              <Card>
                <Text style={styles.uploadLabel}>Panoramax ID: {panoramaxId}</Text>
                {sequenceId && (
                  <Text style={styles.modalInfoValue}>Sekvence: {sequenceId}</Text>
                )}
              </Card>

              {imageUrl && (
                <View style={styles.selectedImageContainer}>
                  <Image 
                    source={{ uri: imageUrl }} 
                    style={styles.selectedImage}
                    onError={() => setError('Nepodařilo se načíst obrázek')}
                  />
                </View>
              )}

              <View style={styles.photoActionButtons}>
                <Button
                  title="Otevřít interaktivně"
                  icon={Icons.expand}
                  onPress={openInBrowser}
                  variant="secondary"
                  style={styles.photoActionButton}
                />
                <Button
                  title="Zavřít"
                  variant="outline"
                  onPress={onClose}
                  style={styles.photoActionButton}
                />
              </View>

              <Card style={styles.infoCard}>
                <Text style={styles.infoTitle}>{Icons.info} Informace o Panoramax</Text>
                <Text style={styles.infoText}>
                  Panoramax je projekt pro sdílení street-level fotek a panoramat.{'\n\n'}
                  • Interaktivní prohlížeč umožňuje prohlížení 360°{'\n'}
                  • Data jsou přístupná pod otevřenou licencí{'\n'}
                  • Spravováno komunitou OpenStreetMap
                </Text>
              </Card>
            </>
          )}
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
    checkLoginStatus();
  };

  const checkLoginStatus = async () => {
    try {
      const response = await fetch(`${FODY_API_BASE}/api.php?cmd=logged`, {
        credentials: 'include',
      });

      if (response.ok) {
        const text = await response.text();
        console.log('API Response:', text); // Logování odpovědi API

        // Pokud API vrací prázdný text, nastavíme výchozí hodnotu
        const username = text.trim() || 'Neznámý uživatel';
        onLoginSuccess(username);
        onClose();
      } else {
        console.error('Chyba při přihlášení, status:', response.status);
      }
    } catch (error) {
      console.error('Chyba při kontrole přihlášení:', error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.loginModalContainer}>
        <View style={styles.loginModalHeader}>
          <Text style={styles.loginModalTitle}>Přihlášení přes OSM</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>{Icons.close}</Text>
          </TouchableOpacity>
        </View>
        
        {loading && (
          <View style={styles.loginLoading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loginLoadingText}>Načítám přihlášení...</Text>
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

// OSM Note Add Modal
const AddOSMNoteModal = ({ visible, location, onClose, onSuccess }) => {
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitNote = async () => {
    if (!noteText.trim()) {
      Alert.alert('Chyba', 'Napište text poznámky');
      return;
    }

    setSubmitting(true);
    try {
      // OSM Notes API - vytvoření poznámky (nevyžaduje auth pro vytvoření)
      const noteWithAppInfo = `${noteText}\n\nvia FodyApp version 1.1.5`;
      const url = `${OSM_NOTES_API}?lat=${location.latitude}&lon=${location.longitude}&text=${encodeURIComponent(noteWithAppInfo)}`;
      const response = await fetch(url, {
        method: 'POST',
      });

      if (response.ok) {
        Alert.alert('Úspěch', 'Poznámka byla vytvořena');
        setNoteText('');
        onSuccess && onSuccess();
        onClose();
      } else {
        const errorText = await response.text();
        Alert.alert('Chyba', `Nepodařilo se vytvořit poznámku: ${errorText}`);
      }
    } catch (error) {
      console.error('Error creating note:', error);
      Alert.alert('Chyba', 'Nepodařilo se vytvořit poznámku');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent>
      <View style={styles.noteModalOverlay}>
        <View style={styles.noteModalContent}>
          <View style={styles.noteModalHeader}>
            <Text style={styles.noteModalTitle}>{Icons.note} Nová OSM poznámka</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.noteModalClose}>{Icons.close}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.noteModalLocation}>
            {Icons.location} {location?.latitude?.toFixed(6)}, {location?.longitude?.toFixed(6)}
          </Text>

          <TextInput
            style={styles.noteModalInput}
            placeholder="Napište poznámku pro mapery OSM..."
            value={noteText}
            onChangeText={setNoteText}
            multiline
            numberOfLines={4}
            placeholderTextColor={COLORS.textSecondary}
          />

          <View style={styles.noteModalInfo}>
            <Text style={styles.noteModalInfoText}>
              {Icons.info} Pro vytváření OSM poznámek není potřeba autorizace.
              Pro správu poznámek (komentáře, uzavření) je nutné přihlášení na osm.org.
            </Text>
          </View>

          <View style={styles.noteModalButtons}>
            <Button
              title="Zrušit"
              variant="outline"
              onPress={onClose}
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button
              title={submitting ? 'Odesílám...' : 'Vytvořit poznámku'}
              onPress={submitNote}
              loading={submitting}
              disabled={!noteText.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Settings Modal for photo limit etc.
const SettingsModal = ({ visible, onClose, settings, onSettingsChange }) => {
  const [photoLimit, setPhotoLimit] = useState(settings?.photoLimit || 160);
  const [customTileUrl, setCustomTileUrl] = useState(settings?.customTileUrl || '');
  const [autoLoadPhotos, setAutoLoadPhotos] = useState(settings?.autoLoadPhotos !== false);
  const [objectLimitEnabled, setObjectLimitEnabled] = useState(settings?.objectLimitEnabled !== false);
  const [objectLimitThreshold, setObjectLimitThreshold] = useState(settings?.objectLimitThreshold || 10);
  const [objectLimitCount, setObjectLimitCount] = useState(settings?.objectLimitCount || 100);
  const [telemetryEnabled, setTelemetryEnabled] = useState(settings?.telemetryEnabled !== false);

  // Modal state pro ruční zadání
  const [manualInputVisible, setManualInputVisible] = useState(false);
  const [manualInputType, setManualInputType] = useState(null);
  const [manualInputValue, setManualInputValue] = useState('');
  const [manualInputMin, setManualInputMin] = useState(10);
  const [manualInputMax, setManualInputMax] = useState(1000);
  const [manualInputLabel, setManualInputLabel] = useState('');

  const saveSettings = () => {
    const newSettings = {
      photoLimit: Math.max(10, Math.min(1000, photoLimit)),
      customTileUrl: customTileUrl.trim(),
      autoLoadPhotos: autoLoadPhotos,
      objectLimitEnabled: objectLimitEnabled,
      objectLimitThreshold: Math.max(1, Math.min(18, objectLimitThreshold)),
      objectLimitCount: Math.max(10, Math.min(500, objectLimitCount)),
      telemetryEnabled: telemetryEnabled,
    };
    onSettingsChange(newSettings);
    AsyncStorage.setItem('telemetryEnabled', JSON.stringify(telemetryEnabled));
    onClose();
  };

  // Otevřít modal pro ruční zadání
  const openManualInput = (type, currentValue, min, max, label) => {
    setManualInputType(type);
    setManualInputValue(String(currentValue));
    setManualInputMin(min);
    setManualInputMax(max);
    setManualInputLabel(label);
    setManualInputVisible(true);
  };

  // Uložit ručně zadanou hodnotu
  const saveManualInput = () => {
    const numValue = Math.max(manualInputMin, Math.min(manualInputMax, parseInt(manualInputValue) || 0));

    switch (manualInputType) {
      case 'photoLimit':
        setPhotoLimit(numValue);
        break;
      case 'objectLimitThreshold':
        setObjectLimitThreshold(numValue);
        break;
      case 'objectLimitCount':
        setObjectLimitCount(numValue);
        break;
    }

    setManualInputVisible(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent>
      <View style={styles.noteModalOverlay}>
        <View style={styles.noteModalContent}>
          <View style={styles.noteModalHeader}>
            <Text style={styles.noteModalTitle}>{Icons.settings} Nastavení</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.noteModalClose}>{Icons.close}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 0, paddingBottom: 16 }}>
            <View style={styles.settingsLabelContainer}>
              <Text style={styles.settingsLabel}>Limit načítání fotek</Text>
              <TouchableOpacity
                style={styles.settingsLimitValue}
                onPress={() => openManualInput('photoLimit', photoLimit, 10, 1000, 'Limit fotek')}
              >
                <Text style={styles.settingsLimitValueText}>{photoLimit} fotek</Text>
              </TouchableOpacity>
            </View>
            <CustomSlider
              value={photoLimit}
              onValueChange={setPhotoLimit}
              minimumValue={10}
              maximumValue={1000}
              step={10}
            />
            <Text style={styles.settingsSliderHint}>Posuň jezdec pro nastavení limitu (10-1000 fotek)</Text>

            <View style={styles.settingsToggleContainer}>
              <View style={styles.settingsToggleLabel}>
                <Text style={styles.settingsLabel}>Automatické načítání fotek</Text>
                <Text style={styles.settingsToggleHint}>Fotky se budou načítat po přeswipování na konec</Text>
              </View>
              <TouchableOpacity
                style={[styles.settingsToggle, autoLoadPhotos && styles.settingsToggleActive]}
                onPress={() => setAutoLoadPhotos(!autoLoadPhotos)}
              >
                <View style={[styles.settingsToggleButton, autoLoadPhotos && styles.settingsToggleButtonActive]} />
              </TouchableOpacity>
            </View>

            <Text style={styles.settingsLabel}>Vlastní mapový podklad (URL)</Text>
            <TextInput
              style={[styles.settingsInput, { marginBottom: 8 }]}
              value={customTileUrl}
              onChangeText={setCustomTileUrl}
              placeholder="https://tile.example.com/{z}/{x}/{y}.png"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="none"
            />
            <Text style={styles.settingsHint}>
              Nechte prázdné pro výchozí OSM. Použijte {'{z}'}, {'{x}'}, {'{y}'} jako placeholdery.
            </Text>

            <View style={styles.settingsToggleContainer}>
              <View style={styles.settingsToggleLabel}>
                <Text style={styles.settingsLabel}>Telemetrie</Text>
                <Text style={styles.settingsToggleHint}>Nahrávání anonymních statistik užívání</Text>
              </View>
              <TouchableOpacity
                style={[styles.settingsToggle, telemetryEnabled && styles.settingsToggleActive]}
                onPress={() => setTelemetryEnabled(!telemetryEnabled)}
              >
                <View style={[styles.settingsToggleButton, telemetryEnabled && styles.settingsToggleButtonActive]} />
              </TouchableOpacity>
            </View>

            {/* Zoom Limit Settings */}
            <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 16, paddingTop: 16 }}>
              <Text style={[styles.settingsLabel, { marginTop: 0 }]}>Limit objektů při nízkém zoomu</Text>

              <View style={styles.settingsToggleContainer}>
                <View style={styles.settingsToggleLabel}>
                  <Text style={styles.settingsLabel}>Zapnout limit</Text>
                  <Text style={styles.settingsToggleHint}>Omezit počet objektů při nízkém zoomu pro výkon</Text>
                </View>
                <TouchableOpacity
                  style={[styles.settingsToggle, objectLimitEnabled && styles.settingsToggleActive]}
                  onPress={() => setObjectLimitEnabled(!objectLimitEnabled)}
                >
                  <View style={[styles.settingsToggleButton, objectLimitEnabled && styles.settingsToggleButtonActive]} />
                </TouchableOpacity>
              </View>

              {objectLimitEnabled && (
                <>
                  <View style={styles.settingsLabelContainer}>
                    <Text style={styles.settingsLabel}>Prahová hodnota zoomu</Text>
                    <TouchableOpacity
                      style={styles.settingsLimitValue}
                      onPress={() => openManualInput('objectLimitThreshold', objectLimitThreshold, 1, 18, 'Zoom threshold')}
                    >
                      <Text style={styles.settingsLimitValueText}>Zoom ≤ {objectLimitThreshold}</Text>
                    </TouchableOpacity>
                  </View>
                  <CustomSlider
                    value={objectLimitThreshold}
                    onValueChange={setObjectLimitThreshold}
                    minimumValue={1}
                    maximumValue={18}
                    step={1}
                  />
                  <Text style={styles.settingsSliderHint}>Limit se aktivuje při zoomu nižší nebo rovné tomuto zoomu</Text>

                  <View style={styles.settingsLabelContainer}>
                    <Text style={styles.settingsLabel}>Maximální počet objektů</Text>
                    <TouchableOpacity
                      style={styles.settingsLimitValue}
                      onPress={() => openManualInput('objectLimitCount', objectLimitCount, 10, 500, 'Max objektů')}
                    >
                      <Text style={styles.settingsLimitValueText}>{objectLimitCount} objektů</Text>
                    </TouchableOpacity>
                  </View>
                  <CustomSlider
                    value={objectLimitCount}
                    onValueChange={setObjectLimitCount}
                    minimumValue={10}
                    maximumValue={500}
                    step={10}
                  />
                  <Text style={styles.settingsSliderHint}>Maximální počet zobrazených objektů (fotek a poznámek)</Text>
                </>
              )}
            </View>
          </ScrollView>

          <View style={styles.noteModalButtons}>
            <Button
              title="Zrušit"
              variant="outline"
              onPress={onClose}
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button
              title="Uložit"
              onPress={saveSettings}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>

      {/* Manual Input Modal */}
      <Modal visible={manualInputVisible} animationType="fade" transparent>
        <View style={styles.manualInputOverlay}>
          <View style={styles.manualInputContainer}>
            <Text style={styles.manualInputTitle}>{manualInputLabel}</Text>
            <Text style={styles.manualInputHint}>
              Zadejte hodnotu ({manualInputMin} - {manualInputMax})
            </Text>

            <TextInput
              style={styles.manualInputField}
              keyboardType="number-pad"
              value={manualInputValue}
              onChangeText={setManualInputValue}
              placeholder={String(manualInputMax / 2)}
              placeholderTextColor={COLORS.textSecondary}
              autoFocus
            />

            <View style={styles.manualInputButtons}>
              <Button
                title="Zrušit"
                variant="outline"
                onPress={() => setManualInputVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Uložit"
                onPress={saveManualInput}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

// ============================================
// HLAVNI OBRAZOVKY
// ============================================

// Layers Modal Component
const LayersModal = ({ visible, onClose, contoursEnabled, onContoursChange, panoramaxEnabled, onPanoramaxChange }) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
    <SafeAreaView style={styles.modalContainer}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{Icons.map} Vrstvy mapy</Text>
        <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
          <Text style={styles.modalCloseText}>{Icons.close}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.layersContent} contentContainerStyle={styles.layersContentContainer}>
        <Text style={styles.layersSection}>Dostupné vrstvy</Text>

        <Card style={styles.layerItem}>
          <View style={styles.layerHeader}>
            <View>
              <Text style={styles.layerTitle}>Vrstevnice ČR</Text>
              <Text style={styles.layerDescription}>Vrstevnice terénní plochy od ČÚZK</Text>
            </View>
            <TouchableOpacity
              style={[styles.layerToggle, contoursEnabled && styles.layerToggleActive]}
              onPress={() => onContoursChange(!contoursEnabled)}
            >
              <View style={[styles.layerToggleButton, contoursEnabled && styles.layerToggleButtonActive]} />
            </TouchableOpacity>
          </View>
        </Card>

        <Card style={styles.layerItem}>
          <View style={styles.layerHeader}>
            <View>
              <Text style={styles.layerTitle}>Panoramax</Text>
              <Text style={styles.layerDescription}>Street-level imagery z různých zdrojů</Text>
            </View>
            <TouchableOpacity
              style={[styles.layerToggle, panoramaxEnabled && styles.layerToggleActive]}
              onPress={() => onPanoramaxChange(!panoramaxEnabled)}
            >
              <View style={[styles.layerToggleButton, panoramaxEnabled && styles.layerToggleButtonActive]} />
            </TouchableOpacity>
          </View>
        </Card>

        <Text style={styles.layersInfo}>
          💡 Tip: Vrstvy se přidávají nad výchozí mapový podklad a mohou ovlivnit výkon mapy.
        </Text>
      </ScrollView>

      <View style={styles.layersButtons}>
        <Button title="Zavřít" onPress={onClose} />
      </View>
    </SafeAreaView>
  </Modal>
);

// FODY TAB - Hlavni funkcionalita
const FodyTab = ({ onNavigateToMapUpload, settings, onSettingsChange }) => {
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
  const [searchType, setSearchType] = useState('all'); // all, author, tag, ref
  
  // User profile modal
  const [userProfileVisible, setUserProfileVisible] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState('');

  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadLocation, setUploadLocation] = useState(null);
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedSupplementaryTags, setSelectedSupplementaryTags] = useState([]);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  // Infinite loading
  const [allPhotos, setAllPhotos] = useState([]);
  const [displayedPhotos, setDisplayedPhotos] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const photosPerPage = settings?.photoLimit || 160;

  // Current zoom level state
  const [currentZoomLevel, setCurrentZoomLevel] = useState(15); // Default zoom level

  // Nacteni fotek z API
  const fetchPhotos = useCallback(async (limit = 2000) => {
    try {
      setLoading(true);
      const response = await fetch(`${FODY_API_BASE}/api.php?cmd=show&limit=${limit}`);
      const data = await response.json();
      if (data.features) {
        setAllPhotos(data.features);
        setDisplayedPhotos(data.features.slice(0, photosPerPage));
        setPage(1);
        setHasMore(data.features.length > photosPerPage);
      }
    } catch (error) {
      console.error('Chyba při načítání fotek:', error);
      Alert.alert('Chyba', 'Nepodařilo se načíst fotky ze serveru.');
    } finally {
      setLoading(false);
    }
  }, [photosPerPage]);

  // Load more photos (infinite scroll)
  const loadMorePhotos = () => {
    if (!hasMore || loading) return;
    
    const nextPage = page + 1;
    const start = nextPage * photosPerPage;
    const end = start + photosPerPage;
    
    const filteredAll = getFilteredPhotos(allPhotos);
    const newPhotos = filteredAll.slice(0, end);
    
    setDisplayedPhotos(newPhotos);
    setPage(nextPage);
    setHasMore(end < filteredAll.length);
  };

  // Filter photos helper
  const getFilteredPhotos = (photosToFilter) => {
    if (!searchQuery) return photosToFilter;
    
    return photosToFilter.filter(photo => {
      const props = photo.properties || {};
      const searchLower = searchQuery.toLowerCase();
      
      const id = props.id != null ? String(props.id) : '';
      const author = props.author != null ? String(props.author).toLowerCase() : '';
      const tagsStr = props.tags != null ? String(props.tags).toLowerCase() : '';
      const refStr = props.ref != null ? String(props.ref).toLowerCase() : '';
      
      switch (searchType) {
        case 'author':
          return author.includes(searchLower);
        case 'tag':
          return tagsStr.includes(searchLower);
        case 'ref':
          return refStr.includes(searchLower);
        default:
          return (
            id.includes(searchLower) ||
            author.includes(searchLower) ||
            tagsStr.includes(searchLower) ||
            refStr.includes(searchLower)
          );
      }
    });
  };

  // When search changes, reset displayed photos
  useEffect(() => {
    const filtered = getFilteredPhotos(allPhotos);
    setDisplayedPhotos(filtered.slice(0, photosPerPage));
    setPage(1);
    setHasMore(filtered.length > photosPerPage);
  }, [searchQuery, searchType, allPhotos]);

  // Nacteni tagu z API
  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch(`${FODY_API_BASE}/api.php?cmd=tags`);
      const data = await response.json();
      setTags(data);
    } catch (error) {
      console.error('Chyba při načítání tagů:', error);
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
      console.error('Chyba při načítání statistik:', error);
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

  // Open user profile
  const openUserProfile = (username) => {
    if (username) {
      setSelectedUsername(username);
      setUserProfileVisible(true);
    }
  };

  // Sekce prohlizeni fotek
  const renderBrowseSection = () => (
    <>
      {/* Vyhledavani */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>{Icons.search}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Hledat..."
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

      {/* Search type filters */}
      <View style={styles.filterRow}>
        {['all', 'author', 'tag', 'ref'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterChip, searchType === type && styles.filterChipActive]}
            onPress={() => setSearchType(type)}
          >
            <Text style={[styles.filterChipText, searchType === type && styles.filterChipTextActive]}>
              {type === 'all' ? 'Vše' : type === 'author' ? 'Autor' : type === 'tag' ? 'Tag' : 'Reference'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Grid/List fotek */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Načítám fotky...</Text>
        </View>
      ) : (
        <FlatList
          data={displayedPhotos}
          keyExtractor={(item) => `photo-${item.properties?.id || Math.random()}`}
          numColumns={viewMode === 'grid' ? 3 : 1}
          key={viewMode}
          renderItem={({ item, index }) => 
            viewMode === 'grid' ? (
              <PhotoGridItem 
                key={`photo-grid-${item.properties?.id || index}`}
                photo={item.properties} 
                onPress={() => openPhotoDetail(item)} 
              />
            ) : (
              <TouchableOpacity 
                key={`photo-list-${item.properties?.id || index}`}
                style={styles.photoListItem} 
                onPress={() => openPhotoDetail(item)}
              >
                <Image
                  source={{ uri: `${FODY_API_BASE}/files/250px/${item.properties?.id}.jpg` }}
                  style={styles.photoListImage}
                />
                <View style={styles.photoListInfo}>
                  <Text style={styles.photoListId}>#{item.properties?.id}</Text>
                  <TouchableOpacity onPress={() => openUserProfile(item.properties?.author)}>
                    <Text style={[styles.photoListAuthor, styles.authorLink]}>
                      {item.properties?.author || 'Neznámý'}
                    </Text>
                  </TouchableOpacity>
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
          onEndReached={settings?.autoLoadPhotos !== false ? loadMorePhotos : null}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            !settings?.autoLoadPhotos && hasMore ? (
              <View style={styles.loadMoreButtonContainer}>
                <Button
                  title="Načíst další fotky"
                  icon={Icons.refresh}
                  onPress={loadMorePhotos}
                  style={styles.loadMoreButton}
                />
              </View>
            ) : settings?.autoLoadPhotos && hasMore ? (
              <View style={styles.loadMoreContainer}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadMoreText}>Načítám další fotky...</Text>
              </View>
            ) : displayedPhotos.length > 0 ? (
              <Text style={styles.endOfListText}>Všechny fotky načteny ({displayedPhotos.length})</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{Icons.photo}</Text>
              <Text style={styles.emptyText}>Žádné fotky k zobrazení</Text>
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
        Alert.alert('Oprávnění', 'Pro nahrání fotek je potřeba oprávnění ke galerii.');
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
        Alert.alert('Oprávněni', 'Pro pořízení fotky je potřeba oprávnění ke kameře.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        exif: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
        
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
        Alert.alert('Oprávněni', 'Pro získani polohy je potřeba oprávnění.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setUploadLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      Alert.alert('Poloha získána', `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
    };

    const uploadPhoto = async () => {
      if (!isLoggedIn) {
        Alert.alert('přihláseni', 'Pro nahrání fotek je potřeba se přihlásit přes OSM účet.', [
          { text: 'Zrušit', style: 'cancel' },
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
        let gp_type = selectedTag;
        if (selectedSupplementaryTags.length > 0) {
          gp_type += ';' + selectedSupplementaryTags.join(';');
        }
        formData.append('gp_type', gp_type);
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
          Alert.alert('Úspěch', 'Fotka byla úspěšně nahrána!');
          setSelectedImage(null);
          setUploadLocation(null);
          setSelectedTag('');
          setSelectedSupplementaryTags([]);
          setReference('');
          setNote('');
          fetchPhotos();
          fetchStats();
        } else {
          Alert.alert('Chyba', `nahrávání selhalo: ${result}`);
        }
      } catch (error) {
        console.error('Chyba při nahrávání:', error);
        Alert.alert('Chyba', 'Nepodařilo se nahrát fotku. Zkontrolujte připojení a přihlášení.');
      } finally {
        setUploading(false);
      }
    };

    return (
      <ScrollView style={styles.uploadContainer} contentContainerStyle={styles.uploadContent}>
        {!isLoggedIn && (
          <Card style={styles.loginPromptCard}>
            <Text style={styles.loginPromptIcon}>{Icons.login}</Text>
            <Text style={styles.loginPromptTitle}>Přihlaste se pro nahrávání</Text>
            <Text style={styles.loginPromptText}>Pro nahrávání fotek je potřeba přihlášení přes OpenStreetMap účet.</Text>
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
            <Text style={styles.uploadLabel}>{Icons.location} Souřadnice</Text>
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
                  key={`tag-${tag.id}`}
                  style={[styles.tagChip, selectedTag === tag.name && styles.tagChipSelected]}
                  onPress={() => setSelectedTag(tag.name)}
                >
                  <Text style={[styles.tagChipText, selectedTag === tag.name && styles.tagChipTextSelected]}>
                    {tag.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.uploadLabel}>{Icons.tag} Doplňovací tagy (volitelné)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScroll}>
              {tags.flatMap(tag => tag.secondary || []).map((tag) => (
                <TouchableOpacity
                  key={`supp-tag-${tag.id}`}
                  style={[styles.tagChip, selectedSupplementaryTags.includes(tag.name) && styles.tagChipSelected]}
                  onPress={() => {
                    setSelectedSupplementaryTags(prev => 
                      prev.includes(tag.name) 
                        ? prev.filter(t => t !== tag.name)
                        : [...prev, tag.name]
                    );
                  }}
                >
                  <Text style={[styles.tagChipText, selectedSupplementaryTags.includes(tag.name) && styles.tagChipTextSelected]}>
                    {tag.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.uploadLabel}>Referenční označení (číslo, kód)</Text>
            <TextInput
              style={styles.uploadInput}
              placeholder="např. PJ345m"
              value={reference}
              onChangeText={setReference}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.uploadLabel}>Poznámka</Text>
            <TextInput
              style={[styles.uploadInput, styles.uploadTextarea]}
              placeholder="Volitelný popis..."
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
            {'\u2022'} Fotka musí být ve formátu JPEG{'\n'}
            {'\u2022'} Minimální velikost: 100 KB{'\n'}
            {'\u2022'} Musí obsahovat EXIF datum pořízení{'\n'}
            {'\u2022'} Pro nahrávání je potřeba přihlášení OSM účtem{'\n'}
            {'\u2022'} Dodržujte pravidla nahrávání a autorských práv{'\n'}
            {'\u2022'} Referenční označení lze vyčíst z rocestníku, většinou se nachází na hlavní tabuli rozcestníku vpravo dole. Jeho znění je většinou ZKRATKA_OKRESU-ČÍSLO (např. PJ jako okres Plzeň-Jih, a za tím číslo unikátní rozcestníku.){'\n'}
            {'\u2022'} Pokud fotka neobsahuje EXIF s polohou, je potřeba zadat souřadnice ručně nebo vybrat na mapě.{'\n'}
            {'\u2022'} Po nahrání bude fotka zkontrolována a ověřena správcem.{'\n'}
            {'\u2022'} Rozcestníky, u kterých máte podezření, že jsou chybné nebo neaktuální, můžete nahlásit pomocí OSM poznámky (viz. sekce Mapa) či zadat poznámku přímo při uploadu.
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
            title="Aktivních"
            value={stats.enabled.toLocaleString()}
            icon={Icons.check}
            color={COLORS.success}
          />
          <StatCard
            title="Ověřených"
            value={stats.verified.toLocaleString()}
            icon={Icons.check}
            color={COLORS.secondary}
          />
          <StatCard
            title="Čeká na ověření"
            value={stats.needVerify.toLocaleString()}
            icon={Icons.warning}
            color={COLORS.warning}
          />
          <StatCard
            title="Zakázaných"
            value={stats.disabled.toLocaleString()}
            icon={Icons.close}
            color={COLORS.error}
          />
          <StatCard
            title="% ověřených"
            value={`${((stats.verified / stats.total) * 100).toFixed(1)}%`}
            icon={Icons.stats}
            color={COLORS.accent}
          />
        </View>
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Načítám statistiky...</Text>
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{Icons.tag} Dostupné typy objektů</Text>
      <Card style={styles.tagsCard}>
        {tags.map((tag) => (
          <View key={`tag-item-${tag.id}`} style={styles.tagItem}>
            <View style={styles.tagHeader}>
              <Text style={styles.tagName}>{tag.name}</Text>
              {tag.ref === 1 && <Badge text="Vyzaduje ref" variant="info" />}
            </View>
            {tag.describe && <Text style={styles.tagDescribe}>{tag.describe}</Text>}
            {tag.secondary && tag.secondary.length > 0 && (
              <View style={styles.secondaryTags}>
                {tag.secondary.map((sec) => (
                  <View key={`sec-tag-${sec.id}`} style={styles.secondaryTag}>
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
        onAuthorPress={openUserProfile}
      />

      {/* User profile modal */}
      <UserProfileModal
        visible={userProfileVisible}
        username={selectedUsername}
        onClose={() => {
          setUserProfileVisible(false);
          setSelectedUsername('');
        }}
      />
    </View>
  );
};

// MAPA TAB - OSM mapa s moznosti nahrávání, polohou uzivatele a rozcesniky
const MapTab = ({ uploadMode: externalUploadMode, onLocationSelected, onUploadComplete, settings }) => {
  const { isLoggedIn, login } = useAuth();
  const webViewRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploadMode, setUploadMode] = useState(externalUploadMode || false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedMarkerInfo, setSelectedMarkerInfo] = useState(null);
  const [osmNotes, setOsmNotes] = useState([]);
  const [showNotes, setShowNotes] = useState(true);
  const [mapBearing, setMapBearing] = useState(0);
  const [currentZoomLevel, setCurrentZoomLevel] = useState(11);
  const [limitAlertVisible, setLimitAlertVisible] = useState(false);

  // Note modal
  const [addNoteModalVisible, setAddNoteModalVisible] = useState(false);
  const [noteLocation, setNoteLocation] = useState(null);

  // Extended popup modal
  const [extendedPopupVisible, setExtendedPopupVisible] = useState(false);
  const [extendedPopupData, setExtendedPopupData] = useState(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadImage, setUploadImage] = useState(null);
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  // Layers modal state
  const [layersModalVisible, setLayersModalVisible] = useState(false);
  const [contoursEnabled, setContoursEnabled] = useState(false);
  const [panoramaxEnabled, setPanoramaxEnabled] = useState(false);

  // Panoramax viewer
  const [panoramaxViewerVisible, setPanoramaxViewerVisible] = useState(false);
  const [selectedPanoramax, setSelectedPanoramax] = useState({ id: null, sequence: null });

  // Animation for "My Location" button
  const flyAnimation = useRef(new Animated.Value(0)).current;

  // Custom tile URL
  const customTileUrl = settings?.customTileUrl || '';

  // Settings pro zoom limit
  const objectLimitEnabled = settings?.objectLimitEnabled !== false;
  const objectLimitThreshold = settings?.objectLimitThreshold || 10;
  const objectLimitCount = settings?.objectLimitCount || 100;

  useEffect(() => {
    fetchTags();
    getUserLocation();
  }, []);

  // Load photos immediately after map loads
  useEffect(() => {
    if (mapLoaded) {
      fetchPhotosForMap();
      fetchOSMNotes();
    }
  }, [mapLoaded]);

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
        let featuresToShow = data.features;

        // Aplikuj limit pokud je aktivovaný a zoom je nízký
        if (objectLimitEnabled && currentZoomLevel < objectLimitThreshold) {
          featuresToShow = data.features.slice(0, objectLimitCount);
        }

        setPhotos(featuresToShow);

        if (webViewRef.current && mapLoaded) {
          webViewRef.current.injectJavaScript(`
            window.updatePhotos(${JSON.stringify(featuresToShow)});
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

  const fetchOSMNotes = async (bounds = null) => {
    try {
      let url = `${OSM_NOTES_API}.json?limit=100`;
      if (bounds) {
        url += `&bbox=${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
      } else {
        // Default area - Prague
        url += `&bbox=14.0,49.8,14.8,50.2`;
      }
      const response = await fetch(url);
      const data = await response.json();
      if (data.features) {
        let featuresToShow = data.features;

        // Aplikuj limit pokud je aktivovaný a zoom je nízký
        if (objectLimitEnabled && currentZoomLevel < objectLimitThreshold) {
          featuresToShow = data.features.slice(0, Math.floor(objectLimitCount / 2));
        }

        setOsmNotes(featuresToShow);
        if (webViewRef.current && mapLoaded) {
          webViewRef.current.injectJavaScript(`
            window.updateOSMNotes(${JSON.stringify(featuresToShow)});
            true;
          `);
        }
      }
    } catch (error) {
      console.error('Chyba pri nacitani OSM notes:', error);
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

  // Funkce pro otevření Panoramax viewer
  const openPanoramaxViewer = async (lat, lon) => {
    try {
      // Zkusíme najít nejbližší Panoramax fotku
      const response = await fetch(
        `https://api.panoramax.xyz/api/sequences?limit=1&nearby=${lat},${lon}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          setSelectedPanoramax({
            id: feature.properties?.id,
            sequence: feature.properties?.first_sequence
          });
          setPanoramaxViewerVisible(true);
        } else {
          Alert.alert('Info', 'V této oblasti nejsou dostupné Panoramax fotky');
        }
      } else {
        throw new Error('Chyba při dotazování API');
      }
    } catch (error) {
      console.error('Chyba při hledání Panoramax:', error);
      Alert.alert('Chyba', 'Nepodařilo se najít Panoramax fotky v této oblasti');
    }
  };

  // Animated fly to user location
  const flyToUserLocation = () => {
    if (!userLocation) {
      Alert.alert('Poloha', 'Poloha není dostupná. Zkuste to znovu.');
      getUserLocation();
      return;
    }

    // Start animation
    Animated.sequence([
      Animated.timing(flyAnimation, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(flyAnimation, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Fly to location with smooth animation
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        map.flyTo([${userLocation.latitude}, ${userLocation.longitude}], 16, {
          animate: true,
          duration: 1.5
        });
        true;
      `);
    }
  };

  // Rotate map (compass)
  const rotateMap = (bearing) => {
    setMapBearing(bearing);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        map.setBearing(${bearing});
        true;
      `);
    }
  };

  // Reset map rotation
  const resetMapRotation = () => {
    rotateMap(0);
  };

  // HTML pro Leaflet mapu s rozsirenymi funkcemi
  const tileUrl = customTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  
  const mapHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate.js"></script>
  <script src="https://unpkg.com/leaflet.vectorgrid/dist/Leaflet.VectorGrid.bundled.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    #map { width: 100%; height: 100%; }
    .photo-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
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
    .note-marker-open {
      width: 24px;
      height: 24px;
      background: #FF5722;
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: white;
      font-weight: bold;
    }
    .note-marker-closed {
      width: 24px;
      height: 24px;
      background: #4CAF50;
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: white;
      font-weight: bold;
    }
    .leaflet-popup-content {
      margin: 8px;
      text-align: center;
      min-width: 200px;
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
    .popup-expand-btn {
      margin-top: 8px;
      padding: 6px 12px;
      background: #2E7D32;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .popup-note-btn {
      margin-top: 4px;
      padding: 6px 12px;
      background: #FF5722;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      rotate: true,
      rotateControl: false,
      touchRotate: true,
    }).setView([49.9601, 14.2367], 11);
    
    var currentTileLayer = L.tileLayer('${tileUrl}', {
      maxZoom: 19,
      attribution: '(C) <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, Fody'
    }).addTo(map);

    // Contours layer - UPRAVENO: přidány minZoom a maxZoom
    var contoursLayer = L.tileLayer.wms('https://ags.cuzk.gov.cz/arcgis/services/ZABAGED_VRSTEVNICE/MapServer/WMSServer', {
      layers: '0',
      transparent: true,
      format: 'image/png',
      attribution: '(C) ČÚZK',
      opacity: 0.4,
      minZoom: 0,  // PŘIDÁNO
      maxZoom: 19  // PŘIDÁNO
    });

    // Panoramax layer - UPRAVENO: přidány minZoom a maxZoom
    var panoramaxLayer = L.vectorGrid.protobuf('https://api.panoramax.xyz/api/map/{z}/{x}/{y}.mvt', {
      vectorTileLayerStyles: {
        sequences: {
          color: '#00ff00',
          opacity: 0.5
        }
      },
      attribution: '© Panoramax',
      minZoom: 0,   // PŘIDÁNO
      maxZoom: 19   // PŘIDÁNO
    });

    // Error handling pro vrstvy
    contoursLayer.on('tileerror', function(error) {
      console.error('Chyba při načítání vrstevnic:', error);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'layerError',
        layer: 'contours',
        message: 'Nepodařilo se načíst vrstevnice. Zkontrolujte připojení.'
      }));
    });

    panoramaxLayer.on('tileerror', function(error) {
      console.error('Chyba při načítání Panoramax:', error);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'layerError',
        layer: 'panoramax',
        message: 'Nepodařilo se načíst Panoramax. Zkontrolujte připojení.'
      }));
    });

    // Store layers for toggling
    window.contoursLayer = contoursLayer;
    window.panoramaxLayer = panoramaxLayer;
    window.layersToggle = {
      contours: false,
      panoramax: false
    };

    // Function to toggle layers
    window.toggleLayer = function(layerName, enabled) {
      window.layersToggle[layerName] = enabled;
      if (layerName === 'contours') {
        if (enabled) {
          map.addLayer(contoursLayer);
        } else {
          map.removeLayer(contoursLayer);
        }
      } else if (layerName === 'panoramax') {
        if (enabled) {
          map.addLayer(panoramaxLayer);
        } else {
          map.removeLayer(panoramaxLayer);
        }
      }
    };

    // Category icons
    var categoryIcons = ${JSON.stringify(CATEGORY_ICONS)};

    function getCategoryIcon(tags) {
      if (!tags) return categoryIcons.default;
      var tagsLower = tags.toLowerCase();
      for (var key in categoryIcons) {
        if (tagsLower.indexOf(key) !== -1) return categoryIcons[key];
      }
      return categoryIcons.default;
    }

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
    var noteMarkers = [];

    // Funkce pro aktualizaci fotek na mape s kategorizovanymi ikonami
    window.updatePhotos = function(photos) {
      photoMarkers.forEach(function(marker) {
        map.removeLayer(marker);
      });
      photoMarkers = [];
      
      photos.forEach(function(photo) {
        if (photo.geometry && photo.geometry.coordinates) {
          var coords = [photo.geometry.coordinates[1], photo.geometry.coordinates[0]];
          var props = photo.properties || {};
          var icon = getCategoryIcon(props.tags);
          
          var photoIcon = L.divIcon({
            className: 'photo-marker',
            html: icon,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          
          var marker = L.marker(coords, { icon: photoIcon }).addTo(map);
          
          var popupContent = '<div class="popup-title">#' + props.id + '</div>' +
            '<img src="https://osm.fit.vutbr.cz/fody/files/250px/' + props.id + '.jpg" onerror="this.style.display=\\'none\\'" />' +
            '<div class="popup-info"><b>' + (props.author || 'Neznámý') + '</b></div>' +
            '<div class="popup-info">' + (props.created || '') + '</div>' +
            (props.tags ? '<div class="popup-tags">' + props.tags + '</div>' : '') +
            '<button class="popup-expand-btn" onclick="window.expandPopup(' + props.id + ')">Více info</button>' +
            '<button class="popup-note-btn" onclick="window.addNoteAt(' + coords[0] + ',' + coords[1] + ')">Přidat poznámku</button>';
          
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

    // OSM Notes
    window.updateOSMNotes = function(notes) {
      noteMarkers.forEach(function(marker) {
        map.removeLayer(marker);
      });
      noteMarkers = [];
      
      notes.forEach(function(note) {
        if (note.geometry && note.geometry.coordinates) {
          var coords = [note.geometry.coordinates[1], note.geometry.coordinates[0]];
          var props = note.properties || {};
          var isOpen = props.status === 'open';
          
          var noteIcon = L.divIcon({
            className: isOpen ? 'note-marker-open' : 'note-marker-closed',
            html: isOpen ? '!' : '✓',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          
          var marker = L.marker(coords, { icon: noteIcon }).addTo(map);
          
          var firstComment = props.comments && props.comments[0] ? props.comments[0].text : 'Bez popisu';
          var popupContent = '<div class="popup-title">OSM Note #' + props.id + '</div>' +
            '<div class="popup-info">Stav: ' + (isOpen ? 'Otevřená' : 'Uzavřená') + '</div>' +
            '<div class="popup-tags">' + firstComment.substring(0, 100) + (firstComment.length > 100 ? '...' : '') + '</div>';
          
          marker.bindPopup(popupContent);
          noteMarkers.push(marker);
        }
      });
    };

    window.expandPopup = function(id) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'expandPopup',
        photoId: id
      }));
    };

    window.addNoteAt = function(lat, lon) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'addNote',
        lat: lat,
        lon: lon
      }));
    };

    window.setUserLocation = function(lat, lon) {
      if (userMarker) {
        map.removeLayer(userMarker);
      }
      userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);
      userMarker.bindPopup('<b>Vaše poloha</b>');
    };

    window.centerOnUser = function() {
      if (userMarker) {
        map.flyTo(userMarker.getLatLng(), 16, { animate: true, duration: 1.5 });
      }
    };

    window.setBearing = function(bearing) {
      map.setBearing(bearing);
    };

    window.setTileLayer = function(url) {
      map.removeLayer(currentTileLayer);
      currentTileLayer = L.tileLayer(url, {
        maxZoom: 19,
        attribution: '(C) OpenStreetMap'
      }).addTo(map);
    };

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
          },
          zoom: map.getZoom()
        }));
      }, 500);
    });

    map.on('zoomend', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'zoomChanged',
        zoom: map.getZoom()
      }));
    });

    window.setUploadMode = function(mode) {
      uploadMode = mode;
      if (!mode && uploadMarker) {
        map.removeLayer(uploadMarker);
        uploadMarker = null;
      }
    };

    // Initial load
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapLoaded' }));
    
    // Trigger initial bounds for loading photos
    setTimeout(function() {
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
  </script>
</body>
</html>
  `;

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'mapLoaded') {
        setMapLoaded(true);
        if (userLocation) {
          webViewRef.current?.injectJavaScript(`
            window.setUserLocation(${userLocation.latitude}, ${userLocation.longitude});
            true;
          `);
        }
      } else if (data.type === 'zoomChanged') {
        setCurrentZoomLevel(data.zoom);

        // Zkontroluj limit
        if (objectLimitEnabled && data.zoom < objectLimitThreshold && !limitAlertVisible) {
          setLimitAlertVisible(true);
        } else if (limitAlertVisible && (data.zoom >= objectLimitThreshold || !objectLimitEnabled)) {
          setLimitAlertVisible(false);
        }
      } else if (data.type === 'locationSelected') {
        setSelectedLocation({ latitude: data.lat, longitude: data.lon });

        if (onLocationSelected) {
          onLocationSelected({ latitude: data.lat, longitude: data.lon });
        } else {
          Alert.alert(
            'Poloha vybrana',
            `Lat: ${data.lat.toFixed(6)}\nLon: ${data.lon.toFixed(6)}`,
            [
              { text: 'Zrušit', style: 'cancel' },
              {
                text: 'Přidat OSM poznamku',
                onPress: () => {
                  setNoteLocation({ latitude: data.lat, longitude: data.lon });
                  setAddNoteModalVisible(true);
                }
              },
              {
                text: 'Nahrát fotku zde',
                onPress: () => {
                  if (!isLoggedIn) {
                    Alert.alert('přihláseni', 'Pro nahrani fotek je potreba se přihlásit.', [
                      { text: 'Zrušit', style: 'cancel' },
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
        // Aplikuj limit na příchozí objekty
        let photosToShow = photos;
        let notesToShow = osmNotes;

        if (objectLimitEnabled && data.zoom < objectLimitThreshold) {
          photosToShow = photos.slice(0, objectLimitCount);
          notesToShow = osmNotes.slice(0, Math.floor(objectLimitCount / 2));
        }

        fetchPhotosForMap(data.bounds);
        fetchOSMNotes(data.bounds);
      } else if (data.type === 'markerClick') {
        setSelectedMarkerInfo(data.photo);
      } else if (data.type === 'expandPopup') {
        // Find photo and show extended popup
        const photo = photos.find(p => p.properties?.id === data.photoId);
        if (photo) {
          setExtendedPopupData(photo);
          setExtendedPopupVisible(true);
        }
      } else if (data.type === 'addNote') {
        setNoteLocation({ latitude: data.lat, longitude: data.lon });
        setAddNoteModalVisible(true);
      } else if (data.type === 'layerError') {
        Alert.alert(
          'Chyba vrstvy',
          `${data.message}`,
          [{ text: 'OK' }]
        );
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
        Alert.alert('Uspech', 'Fotka byla úspěšně nahrána!');
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
      Alert.alert('Chyba', 'Nepodařilo se nahrát fotku.');
    } finally {
      setUploading(false);
    }
  };

  // Animation interpolation for fly button
  const flyButtonScale = flyAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

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
      
      {/* Map controls */}
      <View style={styles.mapControls}>
        <TouchableOpacity
          style={[styles.mapControlBtn, uploadMode && styles.mapControlBtnActive]}
          onPress={toggleUploadMode}
        >
          <Text style={styles.mapControlIcon}>{uploadMode ? Icons.close : Icons.camera}</Text>
          <Text style={[styles.mapControlText, uploadMode && styles.mapControlTextActive]}>
            {uploadMode ? 'Zrušit' : 'Nahrát'}
          </Text>
        </TouchableOpacity>
        
        <Animated.View style={{ transform: [{ scale: flyButtonScale }] }}>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={flyToUserLocation}
          >
            <Text style={styles.mapControlIcon}>{Icons.location}</Text>
            <Text style={styles.mapControlText}>Moje poloha</Text>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={() => {
            if (userLocation) {
              openPanoramaxViewer(userLocation.latitude, userLocation.longitude);
            } else {
              Alert.alert('Poloha', 'Nejprve povolte přístup k poloze');
            }
          }}
        >
          <Text style={styles.mapControlIcon}>🌄</Text>
          <Text style={styles.mapControlText}>Panoramax</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={() => {
            if (userLocation) {
              setNoteLocation(userLocation);
              setAddNoteModalVisible(true);
            } else {
              Alert.alert('Poloha', 'Nejprve povolte přístup k poloze');
            }
          }}
        >
          <Text style={styles.mapControlIcon}>{Icons.note}</Text>
          <Text style={styles.mapControlText}>Poznámka</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={() => setLayersModalVisible(true)}
        >
          <Text style={styles.mapControlIcon}>{Icons.map}</Text>
          <Text style={styles.mapControlText}>Vrstvy</Text>
        </TouchableOpacity>
      </View>

      {uploadMode && (
        <View style={styles.uploadModeOverlay}>
          <Text style={styles.uploadModeText}>
            {Icons.location} Klikněte na mapu pro výběr pozice
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

      {limitAlertVisible && (
        <View style={styles.limitAlertContainer}>
          <View style={styles.limitAlertContent}>
            <Text style={styles.limitAlertIcon}>⚠️</Text>
            <Text style={styles.limitAlertTitle}>Limit objektů aktivován</Text>
            <Text style={styles.limitAlertText}>
              Při nízkém zoomu se zobrazuje max {objectLimitCount} objektů pro výkon. Přibližte si mapu.
            </Text>
            <TouchableOpacity
              style={styles.limitAlertButton}
              onPress={() => setLimitAlertVisible(false)}
            >
              <Text style={styles.limitAlertButtonText}>Rozumím</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Add OSM Note Modal */}
      <AddOSMNoteModal
        visible={addNoteModalVisible}
        location={noteLocation}
        onClose={() => setAddNoteModalVisible(false)}
        onSuccess={() => fetchOSMNotes()}
      />

      {/* Extended Popup Modal */}
      <PhotoDetailModal
        visible={extendedPopupVisible}
        photo={extendedPopupData}
        onClose={() => {
          setExtendedPopupVisible(false);
          setExtendedPopupData(null);
        }}
      />

      {/* Upload Modal */}
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
                  key={`map-tag-${tag.id}`}
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
              placeholder="Volitelný popis..."
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

      {/* Layers Modal */}
      <LayersModal
        visible={layersModalVisible}
        onClose={() => setLayersModalVisible(false)}
        contoursEnabled={contoursEnabled}
        onContoursChange={(enabled) => {
          setContoursEnabled(enabled);
          if (webViewRef.current && mapLoaded) {
            webViewRef.current.injectJavaScript(`window.toggleLayer('contours', ${enabled}); true;`);
          }
        }}
        panoramaxEnabled={panoramaxEnabled}
        onPanoramaxChange={(enabled) => {
          setPanoramaxEnabled(enabled);
          if (webViewRef.current && mapLoaded) {
            webViewRef.current.injectJavaScript(`window.toggleLayer('panoramax', ${enabled}); true;`);
          }
        }}
      />

      {/* Panoramax Viewer Modal */}
      <PanoramaxViewerModal
        visible={panoramaxViewerVisible}
        panoramaxId={selectedPanoramax.id}
        sequenceId={selectedPanoramax.sequence}
        onClose={() => {
          setPanoramaxViewerVisible(false);
          setSelectedPanoramax({ id: null, sequence: null });
        }}
      />
    </View>
  );
};

// VICE TAB - Info, odkazy, projekt mesice
const MoreTab = ({ settings, onSettingsChange }) => {
  const { user, isLoggedIn, login, logout } = useAuth();
  const [projectMonth, setProjectMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [panoramaxManualVisible, setPanoramaxManualVisible] = useState(false);
  const [panoramaxId, setPanoramaxId] = useState('');
  const [panoramaxViewerVisible, setPanoramaxViewerVisible] = useState(false);
  const [selectedPanoramax, setSelectedPanoramax] = useState({ id: null, sequence: null });

  useEffect(() => {
    fetchProjectMonth();
  }, []);

  const fetchProjectMonth = async () => {
    try {
      const response = await fetch(PROJECT_MONTH_API_URL);
      const data = await response.json();
      setProjectMonth(data);
    } catch (error) {
      console.error('Chyba pri načítáni projektu období:', error);
      setProjectMonth(null);
    } finally {
      setLoading(false);
    }
  };

  const openLink = (url) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Chyba', 'Nepodařilo se otevřít odkaz.');
    });
  };

  const getProjectTypeLabel = (type) => {
    switch (type) {
      case 'maproulette': return 'MapRoulette';
      case 'osm': return 'OpenStreetMap';
      case 'wiki': return 'Wiki';
      default: return type || 'Projekt';
    }
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
                <Text style={styles.userCardTitle}>Přihlášen jako:</Text>
                <Text style={styles.userCardName}>{user}</Text>
              </>
            ) : (
              <>
                <Text style={styles.userCardTitle}>Nepřihlášeno</Text>
                <Text style={styles.userCardSubtitle}>Přihlaste se pro nahrávání</Text>
              </>
            )}
          </View>
        </View>
        {isLoggedIn ? (
          <Button
            title="Odhlásit se"
            icon={Icons.logout}
            variant="outline"
            onPress={logout}
          />
        ) : (
          <Button
            title="Přihlásit se přes OSM"
            icon={Icons.login}
            onPress={login}
          />
        )}
      </Card>

      {/* Projekt obdobi - now from API */}
      <Card style={styles.projectCard}>
        <View style={styles.projectHeader}>
          <Text style={styles.projectIcon}>{Icons.calendar}</Text>
          <Text style={styles.projectTitle}>Projekt období</Text>
        </View>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />
        ) : projectMonth ? (
          <View>
            <Text style={styles.projectText}>{projectMonth.name}</Text>
            <View style={styles.projectMeta}>
              <Badge text={getProjectTypeLabel(projectMonth.type)} variant="info" />
              <Text style={styles.projectDate}>
                {projectMonth.month}/{projectMonth.year}
              </Text>
            </View>
            {projectMonth.progress !== undefined && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, projectMonth.progress)}%` }]} />
                </View>
                <Text style={styles.progressText}>{projectMonth.progress.toFixed(1)}% hotovo</Text>
              </View>
            )}
            {projectMonth.link && (
              <Button
                title="Otevřít projekt"
                variant="outline"
                onPress={() => openLink(projectMonth.link)}
                style={{ marginTop: 12 }}
              />
            )}
          </View>
        ) : (
          <Text style={styles.projectText}>Nepodařilo se načíst aktuální projekt.</Text>
        )}
      </Card>

      {/* Nastaveni */}
      <Card style={styles.linkCard} onPress={() => setSettingsModalVisible(true)}>
        <Text style={styles.linkIcon}>{Icons.settings}</Text>
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle}>Nastavení</Text>
          <Text style={styles.linkSubtitle}>Limit fotek, mapový podklad</Text>
        </View>
        <Text style={styles.linkArrow}>{Icons.forward}</Text>
      </Card>

      {/* Panoramax manual viewer */}
      <Card style={styles.linkCard} onPress={() => setPanoramaxManualVisible(true)}>
        <Text style={styles.linkIcon}>🌄</Text>
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle}>Panoramax Viewer</Text>
          <Text style={styles.linkSubtitle}>Prohlížení street-level fotek</Text>
        </View>
        <Text style={styles.linkArrow}>{Icons.forward}</Text>
      </Card>

      {/* Odkazy */}
      <Text style={styles.sectionHeader}>{Icons.web} Užitečné odkazy</Text>
      
      <Card style={styles.linkCard} onPress={() => openLink(GITHUB_URL)}>
        <Text style={styles.linkIcon}>{Icons.github}</Text>
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle}>GitHub</Text>
          <Text style={styles.linkSubtitle}>Zdrojový kód aplikace</Text>
        </View>
        <Text style={styles.linkArrow}>{Icons.forward}</Text>
      </Card>

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
            <Text style={styles.aboutVersion}>Verze 1.1.5</Text>
          </View>
        </View>
        
        <Text style={styles.aboutDescription}>
          Fody je aplikace pro správu a nahrávání fotografií infrastruktury pro projekt OpenStreetMap. 
          Pomocí této aplikace můžete prohlížet, nahrávat a spravovat fotografie rozcestníků, 
          informačních tabulí, bodů záchrany a dalších objektů.
        </Text>

        <View style={styles.aboutFeatures}>
          <Text style={styles.aboutFeatureTitle}>Hlavni funkce:</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Prohlížení fotek z databáze Fody</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Nekonečné načítání fotek</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Profily uživatelů</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Nahrávání nových fotografií</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Interaktivní mapa s kategorizovanými ikonami</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} OSM poznámky na mapě</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Kompas pro otáčení mapy</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Vlastní mapové podklady</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} OSM tagy z Overpass API</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Projekt období z API</Text>
          <Text style={styles.aboutFeature}>{'\u2022'} Panoramax prohlížeč</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.copyright}>
          (C) Michal Schneider and OSMCZ, 2026
        </Text>
        <Text style={styles.license}>
          0BSD OR Apache-2.0 OR CC0-1.0 OR MIT OR Unlicense
        </Text>
        <Text style={styles.credits}>
          Založeno na Fody API od Tomáše Kašpárka a na API pro projekt období od Vojtěcha Fošnára.
        </Text>
        
        <Button
          title="Zdrojový kód na CodeBergu"
          icon={Icons.github}
          variant="outline"
          onPress={() => openLink(GITHUB_URL)}
          style={{ marginTop: 16 }}
        />
      </Card>

      {/* Technicke info */}
      <Card style={styles.techCard}>
        <Text style={styles.techTitle}>Technické informace</Text>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>API Server:</Text>
          <Text style={styles.techValue}>osm.fit.vutbr.cz</Text>
        </View>
         <View style={styles.techRow}>
          <Text style={styles.techLabel}>Alternativní API Server:</Text>
          <Text style={styles.techValue}>osm.fit.vut.cz</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>Projekt období API:</Text>
          <Text style={styles.techValue}>řeřicha.fun</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>Platforma:</Text>
          <Text style={styles.techValue}>React Native / Expo</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>Mapa:</Text>
          <Text style={styles.techValue}>Leaflet + OSM</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>Autorizace:</Text>
          <Text style={styles.techValue}>OAuth2 (OSM)</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>OSM tagy:</Text>
          <Text style={styles.techValue}>Overpass Turbo API</Text>
        </View>
        <View style={styles.techRow}>
          <Text style={styles.techLabel}>Panoramax:</Text>
          <Text style={styles.techValue}>api.panoramax.xyz</Text>
        </View>
      </Card>

      {/* OSM Notes OAuth info */}
      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>{Icons.note} OSM Poznámky</Text>
        <Text style={styles.infoText}>
          Pro vytváření OSM poznámek není potřeba autorizace. Pro správu poznámek 
          (komentáře, uzavření) je nutné přihlášení na osm.org.{'\n\n'}
          Více info: <Text style={{ color: COLORS.secondary }} onPress={() => Linking.openURL('https://openstreetmap.org/user/new')}>openstreetmap.org/user/new</Text>
        </Text>
      </Card>

      {/* Legal text */}
      <Card style={styles.legalCard}>
        <Text style={styles.legalText}>
          Používáním této aplikaci souhlasíte s podmínkami Fody (viz. osm.fit.vutbr.cz/fody) a OpenStreetMap.
        </Text>
      </Card>

      <SettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />

      {/* Panoramax Manual Input Modal */}
      <Modal visible={panoramaxManualVisible} animationType="slide" transparent>
        <View style={styles.noteModalOverlay}>
          <View style={styles.noteModalContent}>
            <View style={styles.noteModalHeader}>
              <Text style={styles.noteModalTitle}>🌄 Panoramax Viewer</Text>
              <TouchableOpacity onPress={() => setPanoramaxManualVisible(false)}>
                <Text style={styles.noteModalClose}>{Icons.close}</Text>
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.noteModalInput}
              placeholder="Zadejte Panoramax ID..."
              value={panoramaxId}
              onChangeText={setPanoramaxId}
              keyboardType="default"
              placeholderTextColor={COLORS.textSecondary}
            />
            
            <View style={styles.noteModalButtons}>
              <Button
                title="Zrušit"
                variant="outline"
                onPress={() => setPanoramaxManualVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Otevřít"
                onPress={() => {
                  if (panoramaxId.trim()) {
                    setSelectedPanoramax({ id: panoramaxId.trim(), sequence: null });
                    setPanoramaxViewerVisible(true);
                    setPanoramaxManualVisible(false);
                    setPanoramaxId('');
                  }
                }}
                disabled={!panoramaxId.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Panoramax Viewer Modal */}
      <PanoramaxViewerModal
        visible={panoramaxViewerVisible}
        panoramaxId={selectedPanoramax.id}
        sequenceId={selectedPanoramax.sequence}
        onClose={() => {
          setPanoramaxViewerVisible(false);
          setSelectedPanoramax({ id: null, sequence: null });
        }}
      />
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
  const [userProfileVisible, setUserProfileVisible] = useState(false);
  const [settings, setSettings] = useState({
    photoLimit: 160,
    customTileUrl: '',
    autoLoadPhotos: true,
    objectLimitEnabled: true,
    objectLimitThreshold: 10,
    objectLimitCount: 100,
    telemetryEnabled: true,
  });
  const [appStartTime] = useState(new Date());
  const [deviceId, setDeviceId] = useState(null);

  // Generuj či načti device ID a načti nastavení
  useEffect(() => {
    const initializeDeviceId = async () => {
      try {
        let id = await AsyncStorage.getItem('deviceId');
        if (!id) {
          // Generuj nový device ID
          id = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await AsyncStorage.setItem('deviceId', id);
        }
        setDeviceId(id);

        // Načti telemetry nastavení
        const telemetryEnabled = await AsyncStorage.getItem('telemetryEnabled');
        if (telemetryEnabled !== null) {
          setSettings(prev => ({ ...prev, telemetryEnabled: JSON.parse(telemetryEnabled) }));
        }
      } catch (error) {
        console.error('Error managing device ID:', error);
      }
    };

    initializeDeviceId();
  }, []);

  const login = () => {
    setLoginModalVisible(true);
  };

  const logout = async () => {
    try {
      await fetch(`${AUTH_URL}?logout`, { credentials: 'include' });
      setUser(null);
      setIsLoggedIn(false);
      Alert.alert('Odhlášeno', 'Byli jste úspěšně odhlášeni.');
    } catch (error) {
      console.error('Chyba pri odhlaseni:', error);
    }
  };

  const handleLoginSuccess = (username) => {
    setUser(username);
    setIsLoggedIn(true);
    setLoginModalVisible(false);
    Alert.alert('Přihlášeno', `Vítejte, ${username}!`);
  };

  const navigateToMapUpload = () => {
    setActiveTab('map');
  };

  const handleSettingsChange = (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  // Function to send anonymous usage data
const sendUsageData = async (data, telemetryEnabled = true) => {
  if (!telemetryEnabled) {
    return; // Don't send if telemetry is disabled
  }
  
  try {
    const response = await fetch('https://fluffini.cz/upload_usage_data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.warn('Failed to upload usage data:', response.statusText);
    }
  } catch (error) {
    console.warn('Error uploading usage data:', error);
  }
};

// Example usage data collection
const collectUsageData = () => {
  if (!deviceId) return; // Počkej na device ID

  const sessionDuration = new Date() - appStartTime;
  const usageData = {
    timestamp: new Date().toISOString(),
    deviceId: deviceId,
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    platform: Platform.OS,
    version: '1.1.5',
    sessionDurationMs: sessionDuration,
    osmUser: isLoggedIn ? user : null,
    activeTab: activeTab,
    settings: {
      objectLimitEnabled: settings.objectLimitEnabled,
      photoLimit: settings.photoLimit,
    }
  };

  sendUsageData(usageData, settings.telemetryEnabled);
};

// Call collectUsageData periodically
useEffect(() => {
  // Initial call after device ID is loaded
  if (deviceId) {
    collectUsageData();
  }

  // Send data every 5 minutes
  const interval = setInterval(() => {
    if (deviceId) {
      collectUsageData();
    }
  }, 5 * 60 * 1000);

  return () => clearInterval(interval);
}, [deviceId, isLoggedIn, user, activeTab, settings]);

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, login, logout }}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
        
        {/* Header */}
        <Header
          title="Fody"
          subtitle={
            activeTab === 'fody' ? 'Fotodatabáze' :
            activeTab === 'map' ? 'Mapa' :
            'Více'
          }
          rightComponent={
            isLoggedIn ? (
              <TouchableOpacity 
                style={styles.headerUserBadge}
                onPress={() => setUserProfileVisible(true)}
              >
                <Text style={styles.headerUserIcon}>{Icons.user}</Text>
                <Text style={styles.headerUserName} numberOfLines={1}>{user}</Text>
              </TouchableOpacity>
            ) : null
          }
        />

        {/* Obsah */}
        <View style={styles.content}>
          {activeTab === 'fody' && (
            <FodyTab 
              onNavigateToMapUpload={navigateToMapUpload}
              settings={settings}
              onSettingsChange={handleSettingsChange}
            />
          )}
          {activeTab === 'map' && <MapTab settings={settings} />}
          {activeTab === 'more' && (
            <MoreTab 
              settings={settings} 
              onSettingsChange={handleSettingsChange}
            />
          )}
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

        {/* User Profile Modal */}
        <UserProfileModal
          visible={userProfileVisible}
          username={user}
          onClose={() => setUserProfileVisible(false)}
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

  // Filter Row
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: COLORS.text,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
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
  authorLink: {
    color: COLORS.secondary,
    textDecorationLine: 'underline',
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

  // Load More
  loadMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  loadMoreText: {
    marginLeft: 8,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  loadMoreButtonContainer: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  loadMoreButton: {
    minWidth: 200,
  },
  endOfListText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 12,
    paddingVertical: 16,
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

  // Fullscreen Photo
  fullscreenPhotoContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullscreenPhotoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  fullscreenPhotoCloseBtn: {
    padding: 8,
  },
  fullscreenPhotoCloseText: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  fullscreenPhotoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  fullscreenPhotoContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  fullscreenPhotoImage: {
    width: '100%',
    height: '100%',
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
  modalAuthorLink: {
    color: COLORS.secondary,
    textDecorationLine: 'underline',
  },

  // OSM Tags Section
  osmTagsSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  osmTagsToggle: {
    paddingVertical: 8,
  },
  osmTagsToggleText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  photoActionButtons: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 16,
    gap: 8,
  },
  photoActionButton: {
    flex: 1,
  },
  tagsTableContainer: {
    marginTop: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
  },
  tagsTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tagsTableTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  tagsTableClose: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  tagsTableLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  tagsTableLoadingText: {
    marginLeft: 8,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  tagsTableError: {
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'center',
  },
  tagsTableEmpty: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  tagsTableScroll: {
    maxHeight: 200,
  },
  tagsTableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tagsTableKey: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  tagsTableValue: {
    flex: 2,
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // User Profile
  userProfileStats: {
    padding: 16,
    backgroundColor: COLORS.surface,
    marginBottom: 8,
  },
  userProfileStatsText: {
    fontSize: 16,
    fontWeight: '600',
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

  // Note Modal
  noteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  noteModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flex: 1,
    flexDirection: 'column',
    paddingTop: 0,
  },
  noteModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  noteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  noteModalClose: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  noteModalLocation: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  noteModalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  noteModalInfo: {
    backgroundColor: COLORS.primaryLight + '20',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  noteModalInfoText: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 18,
  },
  noteModalButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
  },

  // Custom Slider
  customSliderContainer: {
    marginBottom: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  customSliderTrack: {
    width: 280,
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  customSliderTrackActive: {
    backgroundColor: COLORS.border,
  },
  customSliderFilled: {
    height: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  customSliderThumb: {
    position: 'absolute',
    top: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  customSliderThumbActive: {
    width: 24,
    height: 24,
    top: -9,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 5,
      },
    }),
  },

  // Manual Input Modal
  manualInputOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualInputContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 320,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  manualInputTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  manualInputHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  manualInputField: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    textAlign: 'center',
  },
  manualInputButtons: {
    flexDirection: 'row',
    gap: 8,
  },

  // Settings
  settingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 12,
  },
  settingsLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  settingsLimitValue: {
    backgroundColor: COLORS.primary + '25',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '40',
  },
  settingsLimitValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  settingsSliderHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  settingsInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingsHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  settingsToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  settingsToggleLabel: {
    flex: 1,
  },
  settingsToggleHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  settingsToggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    padding: 2,
    marginLeft: 12,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  settingsToggleActive: {
    backgroundColor: COLORS.primary,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  settingsToggleButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  settingsToggleButtonActive: {
    // alignSelf je nyní řízeno přes rodiče
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
    marginTop: 8,
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
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginHorizontal: 3,
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
    fontSize: 14,
    marginRight: 4,
  },
  mapControlText: {
    fontSize: 11,
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

  // Limit Alert
  limitAlertContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  limitAlertContent: {
    backgroundColor: COLORS.warning + 'E6',
    padding: 16,
    alignItems: 'center',
  },
  limitAlertIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  limitAlertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  limitAlertText: {
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },
  limitAlertButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  limitAlertButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
  projectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  projectDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
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

  // Layers Modal Styles
  layersContent: {
    flex: 1,
  },
  layersContentContainer: {
    padding: 16,
  },
  layersSection: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  layerItem: {
    marginBottom: 12,
  },
  layerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  layerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  layerDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  layerToggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.border,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingHorizontal: 2,
  },
  layerToggleActive: {
    backgroundColor: COLORS.primary,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  layerToggleButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    marginLeft: 2,
  },
  layerToggleButtonActive: {
    marginLeft: 'auto',
    marginRight: 2,
  },
  layersInfo: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 16,
    lineHeight: 20,
  },
  layersButtons: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  // Legal Card
  legalCard: {
    marginBottom: 16,
  },
  legalText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },
});
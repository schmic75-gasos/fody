'use client';

/**
 * Fody - React Native aplikace pro OSMCZ
 * (C) Michal Schneider and OSMCZ, 2026
 *
 * Kompletni mobilni klient pro praci s Fody API
 * Kompatibilni s Expo Go
 * 
 * @version 1.1.0
 * @license 0BSD OR Apache-2.0 OR CC0-1.0 OR MIT OR Unlicense
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
  Animated,
  Easing,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

// Konstanty
const FODY_API_BASE = 'https://osm.fit.vutbr.cz/fody';
const AUTH_URL = 'https://osm.fit.vutbr.cz/fody/auth2.php';
const OSM_MAP_URL = 'https://openstreetmap.cz/#map=11/49.9601/14.2367&layers=dAKVGB';
const DISCORD_URL = 'https://discord.gg/A9eRVaRzRe';
const PROJECT_MONTH_API_URL = 'https://xn--eicha-hcbb.fun/api/1/project-of-the-month.json';
const OSM_API_BASE = 'https://api.openstreetmap.org/api/0.6';
const OSM_NOTES_API = 'https://api.openstreetmap.org/api/0.6/notes';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const GITHUB_URL = 'https://github.com/schmic75-gasos/fody';

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

// Photo Detail Modal with expanded features
const PhotoDetailModal = ({ visible, photo, onClose, onAuthorPress }) => {
  const [showTags, setShowTags] = useState(false);

  if (!photo) return null;
  
  const properties = photo.properties || {};
  const coords = photo.geometry?.coordinates;
  
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
                  {properties.author || 'Neznamy'}
                </Text>
              </TouchableOpacity>
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
                {coords 
                  ? `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
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
            keyExtractor={(item) => String(item.properties?.id || Math.random())}
            numColumns={3}
            renderItem={({ item }) => (
              <PhotoGridItem 
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
      // OSM Notes API - vytvoreni poznamky (nevyzaduje auth pro vytvoreni)
      const url = `${OSM_NOTES_API}?lat=${location.latitude}&lon=${location.longitude}&text=${encodeURIComponent(noteText)}`;
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
  const [photoLimit, setPhotoLimit] = useState(String(settings?.photoLimit || 160));
  const [customTileUrl, setCustomTileUrl] = useState(settings?.customTileUrl || '');

  const saveSettings = () => {
    const limit = parseInt(photoLimit) || 160;
    onSettingsChange({
      photoLimit: Math.max(10, Math.min(1000, limit)),
      customTileUrl: customTileUrl.trim(),
    });
    onClose();
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

          <Text style={styles.settingsLabel}>Limit načítání fotek (10-1000)</Text>
          <TextInput
            style={styles.settingsInput}
            value={photoLimit}
            onChangeText={setPhotoLimit}
            keyboardType="numeric"
            placeholder="160"
            placeholderTextColor={COLORS.textSecondary}
          />

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
    </Modal>
  );
};

// ============================================
// HLAVNI OBRAZOVKY
// ============================================

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
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  // Infinite loading
  const [allPhotos, setAllPhotos] = useState([]);
  const [displayedPhotos, setDisplayedPhotos] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const photosPerPage = settings?.photoLimit || 160;

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
                  <TouchableOpacity onPress={() => openUserProfile(item.properties?.author)}>
                    <Text style={[styles.photoListAuthor, styles.authorLink]}>
                      {item.properties?.author || 'Neznamy'}
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
          onEndReached={loadMorePhotos}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            hasMore ? (
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
          Alert.alert('Úspěch', 'Fotka byla úspěšně nahrána!');
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

            <Text style={styles.uploadLabel}>Reference (číslo, kód)</Text>
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
            {'\u2022'} Pro nahrávání je potřeba přihlášení OSM účtem
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

  // Animation for "My Location" button
  const flyAnimation = useRef(new Animated.Value(0)).current;

  // Custom tile URL
  const customTileUrl = settings?.customTileUrl || '';

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
        setPhotos(data.features);
        
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
        setOsmNotes(data.features);
        if (webViewRef.current && mapLoaded) {
          webViewRef.current.injectJavaScript(`
            window.updateOSMNotes(${JSON.stringify(data.features)});
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
            '<div class="popup-info"><b>' + (props.author || 'Neznamy') + '</b></div>' +
            '<div class="popup-info">' + (props.created || '') + '</div>' +
            (props.tags ? '<div class="popup-tags">' + props.tags + '</div>' : '') +
            '<button class="popup-expand-btn" onclick="window.expandPopup(' + props.id + ')">Vice info</button>' +
            '<button class="popup-note-btn" onclick="window.addNoteAt(' + coords[0] + ',' + coords[1] + ')">Pridat poznamku</button>';
          
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
          }
        }));
      }, 500);
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
      } else if (data.type === 'locationSelected') {
        setSelectedLocation({ latitude: data.lat, longitude: data.lon });
        
        if (onLocationSelected) {
          onLocationSelected({ latitude: data.lat, longitude: data.lon });
        } else {
          Alert.alert(
            'Poloha vybrana',
            `Lat: ${data.lat.toFixed(6)}\nLon: ${data.lon.toFixed(6)}`,
            [
              { text: 'Zrusit', style: 'cancel' },
              { 
                text: 'Pridat OSM poznamku',
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
            {uploadMode ? 'Zrusit' : 'Nahrát'}
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
          style={[styles.mapControlBtn, mapBearing !== 0 && styles.mapControlBtnActive]}
          onPress={resetMapRotation}
        >
          <Text style={[styles.mapControlIcon, { transform: [{ rotate: `${-mapBearing}deg` }] }]}>
            {Icons.compass}
          </Text>
          <Text style={styles.mapControlText}>Kompas</Text>
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
const MoreTab = ({ settings, onSettingsChange }) => {
  const { user, isLoggedIn, login, logout } = useAuth();
  const [projectMonth, setProjectMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

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
            <Text style={styles.aboutVersion}>Verze 1.1.1</Text>
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
        </View>

        <View style={styles.divider} />

        <Text style={styles.copyright}>
          (C) Michal Schneider and OSMCZ, 2026
        </Text>
        <Text style={styles.license}>
          0BSD OR Apache-2.0 OR CC0-1.0 OR MIT OR Unlicense
        </Text>
        <Text style={styles.credits}>
          Založeno na Fody API od Tomáše Kašpárka
        </Text>
        
        <Button
          title="Zdrojový kód na GitHubu"
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
      </Card>

      {/* OSM Notes OAuth info */}
      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>{Icons.note} OSM Poznámky</Text>
        <Text style={styles.infoText}>
          Pro vytváření OSM poznámek není potřeba autorizace. Pro správu poznámek 
          (komentáře, uzavření) je nutné přihlášení na osm.org.{'\n\n'}
          Více info: openstreetmap.org/user/new
        </Text>
      </Card>

      <SettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        settings={settings}
        onSettingsChange={onSettingsChange}
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
  const [settings, setSettings] = useState({
    photoLimit: 160,
    customTileUrl: '',
  });

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
              <View style={styles.headerUserBadge}>
                <Text style={styles.headerUserIcon}>{Icons.user}</Text>
                <Text style={styles.headerUserName} numberOfLines={1}>{user}</Text>
              </View>
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
    padding: 20,
    maxHeight: '80%',
  },
  noteModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  },

  // Settings
  settingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 12,
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
});

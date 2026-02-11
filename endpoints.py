"""
Flask endpoints for Fody App Gamification System
Provides API for points, achievements, tasks, and syncing gamification data

Usage:
    python endpoints.py

Endpoints:
    GET  /api/gamification/status/<token>     - Get user status (points, achievements)
    POST /api/gamification/points              - Add points
    POST /api/gamification/achievement         - Unlock achievement
    POST /api/gamification/task               - Complete task
    POST /api/gamification/sync               - Full sync (POST)
    GET  /api/gamification/leaderboard        - Get leaderboard
    POST /api/gamification/settings           - Update settings
    GET  /api/gamification/info               - Get gamification info
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from datetime import datetime
import uuid

app = Flask(__name__)
CORS(app)

# Base directory for data files
DATA_DIR = 'gamification_data'

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# File paths - using fody-specific directory to avoid conflicts
FODY_DATA_DIR = 'fody_gamification_data'
FODY_POINTS_FILE = os.path.join(FODY_DATA_DIR, 'points.json')
FODY_ACHIEVEMENTS_FILE = os.path.join(FODY_DATA_DIR, 'achievements.json')
FODY_TASKS_FILE = os.path.join(FODY_DATA_DIR, 'tasks.json')
FODY_USERS_FILE = os.path.join(FODY_DATA_DIR, 'users.json')
FODY_SETTINGS_FILE = os.path.join(FODY_DATA_DIR, 'settings.json')

# Ensure fody data directory exists
os.makedirs(FODY_DATA_DIR, exist_ok=True)

# Default achievements definition
DEFAULT_ACHIEVEMENTS = {
    "first_login": {
        "id": "first_login",
        "name": "První kroky",
        "description": "První spuštění aplikace",
        "icon": "👋",
        "points": 50,
        "category": "milestone"
    },
    "first_photo": {
        "id": "first_photo",
        "name": "Začínáme fotit",
        "description": "První nahraná fotka",
        "icon": "📸",
        "points": 100,
        "category": "upload"
    },
    "explorer": {
        "id": "explorer",
        "name": "Objevitel",
        "description": "Prozkoumal/a jsi všechny sekce aplikace",
        "icon": "🧭",
        "points": 75,
        "category": "exploration"
    },
    "map_navigation": {
        "id": "map_navigation",
        "name": "Kartograf",
        "description": "Použil/a jsi mapu",
        "icon": "🗺️",
        "points": 25,
        "category": "exploration"
    },
    "note_creator": {
        "id": "note_creator",
        "name": "Tvůrce poznámek",
        "description": "Vytvořil/a jsi OSM poznámku",
        "icon": "📝",
        "points": 30,
        "category": "note"
    },
    "photo_collector_10": {
        "id": "photo_collector_10",
        "name": "Sběratel",
        "description": "Nahrál/a jsi 10 fotek",
        "icon": "📚",
        "points": 150,
        "category": "upload"
    },
    "photo_collector_50": {
        "id": "photo_collector_50",
        "name": "Expertní sběratel",
        "description": "Nahrál/a jsi 50 fotek",
        "icon": "🏆",
        "points": 500,
        "category": "upload"
    },
    "night_owl": {
        "id": "night_owl",
        "name": "Noční sova",
        "description": "Použil/a jsi aplikaci po 22:00",
        "icon": "🦉",
        "points": 20,
        "category": "special"
    },
    "early_bird": {
        "id": "early_bird",
        "name": "Ranní ptáče",
        "description": "Použil/a jsi aplikaci před 6:00",
        "icon": "🐦",
        "points": 20,
        "category": "special"
    },
    "weekend_warrior": {
        "id": "weekend_warrior",
        "name": "Víkendový bojovník",
        "description": "Použil/a jsi aplikaci o víkendu",
        "icon": "⚔️",
        "points": 25,
        "category": "special"
    },
    "speed_demon": {
        "id": "speed_demon",
        "name": "Rychlostní démon",
        "description": "Nahrál/a jsi fotku do 30 sekund od otevření aplikace",
        "icon": "⚡",
        "points": 40,
        "category": "special"
    },
    "quality_contributor": {
        "id": "quality_contributor",
        "name": "Kvalitní příspěvek",
        "description": "Přidal/a jsi poznámku k nahrané fotce",
        "icon": "⭐",
        "points": 35,
        "category": "upload"
    },
    "complete_profile": {
        "id": "complete_profile",
        "name": "Kompletní profil",
        "description": "Přihlásil/a ses přes OSM",
        "icon": "✅",
        "points": 50,
        "category": "milestone"
    },
    "settings_guru": {
        "id": "settings_guru",
        "name": "Guru nastavení",
        "description": "Otevřel/a jsi nastavení aplikace",
        "icon": "⚙️",
        "points": 15,
        "category": "exploration"
    }
}

# Default tasks for exploration
DEFAULT_TASKS = {
    "task_first_upload": {
        "id": "task_first_upload",
        "name": "Nahrát první fotku",
        "description": "Pokus se nahrát svou první fotku do databáze Fody",
        "points": 50,
        "icon": "📷",
        "completed": False
    },
    "task_explore_map": {
        "id": "task_explore_map",
        "name": "Prozkoumat mapu",
        "description": "Otevři kartu Mapa a prohlédni si rozcestníky",
        "points": 25,
        "icon": "🗺️",
        "completed": False
    },
    "task_check_stats": {
        "id": "task_check_stats",
        "name": "Zkontrolovat statistiky",
        "description": "Podívej se na statistiky v sekci Fody",
        "points": 15,
        "icon": "📊",
        "completed": False
    },
    "task_add_note": {
        "id": "task_add_note",
        "name": "Vytvořit poznámku",
        "description": "Přidej OSM poznámku na mapě",
        "points": 30,
        "icon": "📝",
        "completed": False
    },
    "task_change_settings": {
        "id": "task_change_settings",
        "name": "Změnit nastavení",
        "description": "Otevři nastavení a prohlédni si je",
        "points": 10,
        "icon": "⚙️",
        "completed": False
    },
    "task_view_project": {
        "id": "task_view_project",
        "name": "Projekt období",
        "description": "Podívej se na aktuální projekt období",
        "points": 20,
        "icon": "📅",
        "completed": False
    }
}

# Point values for actions
POINT_VALUES = {
    "photo_upload": 10,
    "photo_upload_with_note": 15,
    "photo_upload_with_reference": 12,
    "osm_note_create": 5,
    "app_open": 1,
    "map_view": 2,
    "stats_view": 1,
    "settings_view": 1
}


def ensure_file(filepath, default=None):
    """Ensure file exists, create with default if not."""
    if not os.path.exists(filepath):
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(default if default is not None else {}, f, ensure_ascii=False, indent=2)


def load_json_fody(filepath):
    """Load JSON from fody-specific file."""
    ensure_file(filepath)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_json_fody(filepath, data):
    """Save data to fody-specific JSON file."""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_user_data(token):
    """Get user data by token from fody-specific storage."""
    users = load_json_fody(FODY_USERS_FILE)
    if token not in users:
        # Create new user
        users[token] = {
            "token": token,
            "created_at": datetime.now().isoformat(),
            "points": 0,
            "level": 1,
            "achievements": [],
            "completed_tasks": [],
            "total_uploads": 0,
            "total_notes": 0,
            "last_active": datetime.now().isoformat(),
            "settings": {
                "gamification_enabled": True,
                "notifications_enabled": True
            }
        }
        save_json_fody(FODY_USERS_FILE, users)
    return users[token]


def update_user_data(token, data):
    """Update user data in fody-specific storage."""
    users = load_json_fody(FODY_USERS_FILE)
    if token in users:
        users[token].update(data)
        users[token]["last_active"] = datetime.now().isoformat()
        save_json_fody(FODY_USERS_FILE, users)
    return users.get(token, {})


def calculate_level(points):
    """Calculate level from points."""
    # Level formula: level = floor(sqrt(points / 100))
    if points < 100:
        return 1
    return int((points ** 0.5) // 10) + 1


def calculate_level_progress(points):
    """Calculate progress to next level (0-100)."""
    current_level = calculate_level(points)
    points_for_current = (current_level - 1) * 100
    points_for_next = current_level * 100
    if points >= points_for_next:
        return 100
    progress = ((points - points_for_current) / (points_for_next - points_for_current)) * 100
    return min(100, max(0, progress))


# ============================================
# API ENDPOINTS
# ============================================

@app.route('/api/gamification/info', methods=['GET'])
def get_gamification_info():
    """Get gamification information - achievements, tasks, point values."""
    ensure_file(FODY_ACHIEVEMENTS_FILE, DEFAULT_ACHIEVEMENTS)
    ensure_file(FODY_TASKS_FILE, DEFAULT_TASKS)
    
    return jsonify({
        "achievements": load_json_fody(FODY_ACHIEVEMENTS_FILE),
        "tasks": load_json_fody(FODY_TASKS_FILE),
        "point_values": POINT_VALUES,
        "level_formula": {
            "description": "Level = floor(sqrt(points / 100)) + 1",
            "example": {
                0: 1,
                100: 2,
                400: 3,
                900: 4,
                1600: 5
            }
        }
    }), 200


@app.route('/api/gamification/status/<token>', methods=['GET'])
def get_user_status(token):
    """Get user's gamification status."""
    if not token or len(token) < 8:
        return jsonify({"error": "Invalid token"}), 400
    
    user = get_user_data(token)
    
    # Calculate level
    points = user.get("points", 0)
    level = calculate_level(points)
    level_progress = calculate_level_progress(points)
    
    # Get next level info
    points_for_next_level = level * 100
    points_needed = max(0, points_for_next_level - points)
    
    # Get unlocked achievements
    achievement_ids = user.get("achievements", [])
    all_achievements = load_json_fody(FODY_ACHIEVEMENTS_FILE)
    unlocked_achievements = [
        {**ach, "unlocked_at": user.get("achievement_unlocks", {}).get(ach_id, None)}
        for ach_id, ach in all_achievements.items()
        if ach_id in achievement_ids
    ]
    
    # Get completed tasks
    completed_task_ids = user.get("completed_tasks", [])
    all_tasks = load_json_fody(FODY_TASKS_FILE)
    completed_tasks = [
        {**task, "completed_at": user.get("task_completions", {}).get(task_id, None)}
        for task_id, task in all_tasks.items()
        if task_id in completed_task_ids
    ]
    
    return jsonify({
        "token": token,
        "points": points,
        "level": level,
        "level_progress": round(level_progress, 1),
        "points_to_next_level": points_needed,
        "next_level_points": points_for_next_level,
        "achievements": {
            "unlocked": len(unlocked_achievements),
            "total": len(all_achievements),
            "list": unlocked_achievements
        },
        "tasks": {
            "completed": len(completed_tasks),
            "total": len(all_tasks),
            "list": completed_tasks
        },
        "stats": {
            "total_uploads": user.get("total_uploads", 0),
            "total_notes": user.get("total_notes", 0)
        },
        "settings": user.get("settings", {"gamification_enabled": True}),
        "created_at": user.get("created_at"),
        "last_active": user.get("last_active")
    }), 200


@app.route('/api/gamification/points', methods=['POST'])
def add_points():
    """Add points to user."""
    data = request.json
    token = data.get('token')
    points = data.get('points', 0)
    action = data.get('action', 'general')
    details = data.get('details', {})
    
    if not token or len(token) < 8:
        return jsonify({"error": "Invalid token"}), 400
    
    if points <= 0:
        return jsonify({"error": "Points must be positive"}), 400
    
    user = get_user_data(token)
    old_points = user.get("points", 0)
    new_points = old_points + points
    
    update_data = {
        "points": new_points,
        f"points_history_{datetime.now().isoformat()}": {
            "action": action,
            "amount": points,
            "details": details
        }
    }
    
    # Update upload/note counts if applicable
    if action == "photo_upload":
        update_data["total_uploads"] = user.get("total_uploads", 0) + 1
    elif action == "osm_note_create":
        update_data["total_notes"] = user.get("total_notes", 0) + 1
    
    # Check for level up
    old_level = calculate_level(old_points)
    new_level = calculate_level(new_points)
    level_up = new_level > old_level
    
    update_user_data(token, update_data)
    
    return jsonify({
        "success": True,
        "points_added": points,
        "total_points": new_points,
        "level": new_level,
        "level_up": level_up,
        "message": f"+{points} bodů" + (f" 🎉 LEVEL {new_level}!" if level_up else "")
    }), 200


@app.route('/api/gamification/achievement', methods=['POST'])
def unlock_achievement():
    """Unlock an achievement for user."""
    data = request.json
    token = data.get('token')
    achievement_id = data.get('achievement_id')
    
    if not token or len(token) < 8:
        return jsonify({"error": "Invalid token"}), 400
    
    if not achievement_id:
        return jsonify({"error": "Achievement ID required"}), 400
    
    user = get_user_data(token)
    achievements = user.get("achievements", [])
    
    if achievement_id in achievements:
        return jsonify({
            "success": False,
            "message": "Achievement already unlocked"
        }), 200
    
    # Get achievement info
    all_achievements = load_json_fody(FODY_ACHIEVEMENTS_FILE)
    if achievement_id not in all_achievements:
        return jsonify({"error": "Achievement not found"}), 404
    
    achievement = all_achievements[achievement_id]
    points_reward = achievement.get("points", 0)
    
    # Unlock achievement
    achievements.append(achievement_id)
    
    update_data = {
        "achievements": achievements,
        f"achievement_unlocks_{achievement_id}": datetime.now().isoformat(),
        "points": user.get("points", 0) + points_reward
    }
    
    update_user_data(token, update_data)
    
    return jsonify({
        "success": True,
        "achievement": achievement,
        "points_earned": points_reward,
        "message": f"🏆 {achievement['icon']} {achievement['name']} - +{points_reward} bodů!"
    }), 200


@app.route('/api/gamification/task', methods=['POST'])
def complete_task():
    """Mark a task as completed."""
    data = request.json
    token = data.get('token')
    task_id = data.get('task_id')
    
    if not token or len(token) < 8:
        return jsonify({"error": "Invalid token"}), 400
    
    if not task_id:
        return jsonify({"error": "Task ID required"}), 400
    
    user = get_user_data(token)
    completed_tasks = user.get("completed_tasks", [])
    
    if task_id in completed_tasks:
        return jsonify({
            "success": False,
            "message": "Task already completed"
        }), 200
    
    # Get task info
    all_tasks = load_json_fody(FODY_TASKS_FILE)
    if task_id not in all_tasks:
        return jsonify({"error": "Task not found"}), 404
    
    task = all_tasks[task_id]
    points_reward = task.get("points", 0)
    
    # Complete task
    completed_tasks.append(task_id)
    
    update_data = {
        "completed_tasks": completed_tasks,
        f"task_completions_{task_id}": datetime.now().isoformat(),
        "points": user.get("points", 0) + points_reward
    }
    
    update_user_data(token, update_data)
    
    return jsonify({
        "success": True,
        "task": task,
        "points_earned": points_reward,
        "message": f"✅ {task['icon']} {task['name']} - +{points_reward} bodů!"
    }), 200


@app.route('/api/gamification/sync', methods=['POST'])
def full_sync():
    """Full synchronization endpoint."""
    data = request.json
    token = data.get('token')
    client_data = data.get('data', {})
    
    if not token or len(token) < 8:
        return jsonify({"error": "Invalid token"}), 400
    
    user = get_user_data(token)
    
    # Merge local data with server data
    # Server data takes precedence for persistent state
    
    # Process achievements to unlock
    client_achievements = client_data.get("achievements", [])
    server_achievements = user.get("achievements", [])
    all_achievements = load_json_fody(FODY_ACHIEVEMENTS_FILE)
    
    # Unlock any new achievements
    new_achievements = []
    for ach_id in client_achievements:
        if ach_id not in server_achievements and ach_id in all_achievements:
            server_achievements.append(ach_id)
            new_achievements.append({
                **all_achievements[ach_id],
                "unlocked_at": datetime.now().isoformat()
            })
    
    # Process completed tasks
    client_tasks = client_data.get("completed_tasks", [])
    server_tasks = user.get("completed_tasks", [])
    all_tasks = load_json_fody(FODY_TASKS_FILE)
    
    new_tasks = []
    for task_id in client_tasks:
        if task_id not in server_tasks and task_id in all_tasks:
            server_tasks.append(task_id)
            new_tasks.append({
                **all_tasks[task_id],
                "completed_at": datetime.now().isoformat()
            })
    
    # Calculate total points to award
    points_to_add = 0
    for ach in new_achievements:
        points_to_add += ach.get("points", 0)
    for task in new_tasks:
        points_to_add += task.get("points", 0)
    
    # Update server data
    update_data = {
        "achievements": server_achievements,
        "completed_tasks": server_tasks,
        "points": user.get("points", 0) + points_to_add,
        "settings": client_data.get("settings", user.get("settings", {}))
    }
    
    update_user_data(token, update_data)
    
    # Return full status
    return jsonify({
        "success": True,
        "new_achievements": new_achievements,
        "new_tasks": new_tasks,
        "points_earned": points_to_add,
        "status": get_user_status(token)[0].get_json()
    }), 200


@app.route('/api/gamification/leaderboard', methods=['GET'])
def get_leaderboard():
    """Get points leaderboard."""
    users = load_json_fody(FODY_USERS_FILE)
    
    # Sort by points
    leaderboard = []
    for token, user_data in users.items():
        points = user_data.get("points", 0)
        level = calculate_level(points)
        achievements = len(user_data.get("achievements", []))
        
        leaderboard.append({
            "token": token[:8] + "...",  # Anonymize
            "points": points,
            "level": level,
            "achievements": achievements
        })
    
    # Sort and take top 100
    leaderboard.sort(key=lambda x: x["points"], reverse=True)
    leaderboard = leaderboard[:100]
    
    # Add ranks
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1
    
    return jsonify({
        "leaderboard": leaderboard,
        "total_users": len(users)
    }), 200


@app.route('/api/gamification/settings', methods=['POST'])
def update_settings():
    """Update user settings."""
    data = request.json
    token = data.get('token')
    settings = data.get('settings', {})
    
    if not token or len(token) < 8:
        return jsonify({"error": "Invalid token"}), 400
    
    user = get_user_data(token)
    current_settings = user.get("settings", {})
    
    # Merge settings
    current_settings.update(settings)
    
    update_user_data(token, {"settings": current_settings})
    
    return jsonify({
        "success": True,
        "settings": current_settings
    }), 200


@app.route('/api/gamification/initialize', methods=['POST'])
def initialize_user():
    """Initialize user with token (called on first app launch)."""
    data = request.json
    token = data.get('token')
    device_info = data.get('device_info', {})
    
    if not token or len(token) < 8:
        return jsonify({"error": "Invalid token"}), 400
    
    user = get_user_data(token)
    
    # If new user, add first login achievement
    if user.get("created_at") == user.get("last_active"):
        all_achievements = load_json(ACHIEVEMENTS_FILE)
        if "first_login" in all_achievements and "first_login" not in user.get("achievements", []):
            achievements = user.get("achievements", []) + ["first_login"]
            update_user_data(token, {
                "achievements": achievements,
                "achievement_unlocks_first_login": datetime.now().isoformat(),
                "points": user.get("points", 0) + all_achievements["first_login"]["points"]
            })
    
    return jsonify({
        "success": True,
        "message": "User initialized",
        "status": get_user_status(token)[0].get_json()
    }), 200


# ============================================
# STATS ENDPOINTS (existing)
# ============================================

@app.route('/upload_usage_data', methods=['POST'])
def upload_usage_data():
    """Receive usage data (existing endpoint)."""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Ensure directory exists
        os.makedirs(DATA_DIR, exist_ok=True)
        
        # Load existing stats
        stats_file = os.path.join(DATA_DIR, 'usage_stats.json')
        ensure_file(stats_file, [])
        
        stats = load_json(stats_file)
        stats.append(data)
        save_json(stats_file, stats)
        
        return jsonify({'message': 'Data uploaded successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/get_fody_stats', methods=['GET'])
def get_fody_stats():
    """Get usage stats (existing endpoint)."""
    try:
        stats_file = os.path.join(DATA_DIR, 'usage_stats.json')
        ensure_file(stats_file, [])
        stats = load_json(stats_file)
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# MAIN
# ============================================

if __name__ == '__main__':
    # Initialize data files
    ensure_file(ACHIEVEMENTS_FILE, DEFAULT_ACHIEVEMENTS)
    ensure_file(TASKS_FILE, DEFAULT_TASKS)
    ensure_file(USERS_FILE)
    ensure_file(SETTINGS_FILE)
    
    print("=" * 60)
    print("Fody App Gamification Server")
    print("=" * 60)
    print("\nAvailable endpoints:")
    print("  GET  /api/gamification/info           - Get gamification info")
    print("  GET  /api/gamification/status/<token> - Get user status")
    print("  POST /api/gamification/points         - Add points")
    print("  POST /api/gamification/achievement    - Unlock achievement")
    print("  POST /api/gamification/task           - Complete task")
    print("  POST /api/gamification/sync           - Full sync")
    print("  GET  /api/gamification/leaderboard    - Get leaderboard")
    print("  POST /api/gamification/settings       - Update settings")
    print("  POST /api/gamification/initialize      - Initialize user")
    print("\nExisting endpoints:")
    print("  POST /upload_usage_data               - Upload usage data")
    print("  GET  /get_fody_stats                  - Get usage stats")
    print("\n" + "=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)


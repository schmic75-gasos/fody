from flask import Flask, request, jsonify
import json
import os

app = Flask(__name__)

# Path to the stats file
STATS_FILE = 'fody_stats.json'

# Ensure the stats file exists
def ensure_stats_file():
    if not os.path.exists(STATS_FILE):
        with open(STATS_FILE, 'w') as f:
            json.dump([], f)

# Load stats from the file
def load_stats():
    ensure_stats_file()
    with open(STATS_FILE, 'r') as f:
        return json.load(f)

# Save stats to the file
def save_stats(stats):
    with open(STATS_FILE, 'w') as f:
        json.dump(stats, f)

# Endpoint to receive usage data
@app.route('/upload_usage_data', methods=['POST'])
def upload_usage_data():
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        stats = load_stats()
        stats.append(data)
        save_stats(stats)

        return jsonify({'message': 'Data uploaded successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Endpoint to retrieve usage stats
@app.route('/get_fody_stats', methods=['GET'])
def get_fody_stats():
    try:
        stats = load_stats()
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
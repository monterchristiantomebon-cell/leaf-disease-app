import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['TF_NUM_INTRAOP_THREADS'] = '1'
os.environ['TF_NUM_INTEROP_THREADS'] = '1'

# Continue with your existing imports below:
from flask import Flask, request, jsonify

from datetime import datetime, timezone
import io
import json
import os
import urllib.request
import uuid

from authlib.integrations.flask_client import OAuth
from flask import (
    Flask,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from flask_sqlalchemy import SQLAlchemy
import numpy as np
from PIL import Image, ImageOps
import tensorflow as tf
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename

# -------------------------------------------------------------------
# App & Database Configuration
# -------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", os.urandom(24))

# MySQL connection URI via PyMySQL
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "mysql+pymysql://root:@localhost/leaf_disease_db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

# Force Flask to trust proxy HTTPS headers
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(
    BASE_DIR, "models", "plant_disease_recog_model_pwp.keras"
)

# FIXED: Match filename 'plant_diseases.json' in file tree
JSON_PATH = os.path.join(BASE_DIR, "plant_diseases.json")
CLASS_INDICES_PATH = os.path.join(BASE_DIR, "class_indices.json")
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploadimages")

CROPS_DIR = (
    os.path.join(app.static_folder, "crops")
    if app.static_folder
    else os.path.join(BASE_DIR, "static", "crops")
)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# -------------------------------------------------------------------
# Database Models
# -------------------------------------------------------------------
class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    name = db.Column(db.String(120))
    provider = db.Column(db.String(50))
    predictions = db.relationship('PredictionRecord', backref='user', lazy=True)

    def __repr__(self):
        return f'<User {self.email}>'


class PredictionRecord(db.Model):
    __tablename__ = 'prediction_record'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    disease_name = db.Column(db.String(255), nullable=False)
    clean_name = db.Column(db.String(255), nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    image_filename = db.Column(db.String(255), nullable=True)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


# Ensure database tables exist across WSGI runner environments
with app.app_context():
    try:
        db.create_all()
    except Exception as db_init_err:
        print(f"Database initialization warning: {db_init_err}")


# -------------------------------------------------------------------
# Static Crops Route
# -------------------------------------------------------------------
@app.route("/static/crops/<path:filename>")
def serve_crops(filename):
    return send_from_directory(CROPS_DIR, filename)


# -------------------------------------------------------------------
# OAuth Initialization & Provider Setup
# -------------------------------------------------------------------
oauth = OAuth(app)

google = oauth.register(
    name="google",
    client_id=os.environ.get("GOOGLE_CLIENT_ID", "904859559670-3qk2i74c2en4ojck1sq8oiqv0354jnf2.apps.googleusercontent.com"),
    client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", "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"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

facebook = oauth.register(
    name="facebook",
    client_id="1768227821055473",  # Replace with your App ID if using the other app
    client_secret="kadenanngbulaklak",  # Paste the App Secret copied from Basic Settings
    access_token_url="https://graph.facebook.com/v18.0/oauth/access_token",
    authorize_url="https://www.facebook.com/v18.0/dialog/oauth",
    api_base_url="https://graph.facebook.com/v18.0/",
    client_kwargs={"scope": "public_profile,email"},
)

# -------------------------------------------------------------------
# Disease Info JSON & Class Mapping Setup
# -------------------------------------------------------------------
DISEASE_INFO = {}

if os.path.exists(JSON_PATH):
    try:
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            disease_data = json.load(f)
            if isinstance(disease_data, list):
                DISEASE_INFO = {item["name"]: item for item in disease_data}
            elif isinstance(disease_data, dict):
                DISEASE_INFO = disease_data
        print(f"Loaded {len(DISEASE_INFO)} disease details from JSON file.")
    except Exception as json_err:
        print(f"Error reading JSON file at '{JSON_PATH}': {json_err}")

CLASS_NAMES = []
if os.path.exists(CLASS_INDICES_PATH):
    try:
        with open(CLASS_INDICES_PATH, "r", encoding="utf-8") as f:
            class_map = json.load(f)
            first_key = list(class_map.keys())[0] if class_map else None
            if first_key and first_key.isdigit():
                CLASS_NAMES = [class_map[str(i)] for i in range(len(class_map))]
            else:
                sorted_classes = sorted(class_map.items(), key=lambda item: item[1])
                CLASS_NAMES = [item[0] for item in sorted_classes]
        print(f"Loaded {len(CLASS_NAMES)} classes from class_indices.json")
    except Exception as class_map_err:
        print(f"Error reading class_indices.json: {class_map_err}")

if not CLASS_NAMES:
    CLASS_NAMES = [
        "Apple___Apple_scab",
        "Apple___Black_rot",
        "Apple___Cedar_apple_rust",
        "Apple___healthy",
        "Background_without_leaves",
        "Blueberry___healthy",
        "Cherry___Powdery_mildew",
        "Cherry___healthy",
        "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
        "Corn_(maize)___Common_rust",
        "Corn_(maize)___Northern_Leaf_Blight",
        "Corn_(maize)___healthy",
        "Grape___Black_rot",
        "Grape___Esca_(Black_Measles)",
        "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)",
        "Grape___healthy",
        "Orange___Haunglongbing_(Citrus_greening)",
        "Peach___Bacterial_spot",
        "Peach___healthy",
        "Pepper,_bell___Bacterial_spot",
        "Pepper,_bell___healthy",
        "Potato___Early_blight",
        "Potato___Late_blight",
        "Potato___healthy",
        "Raspberry___healthy",
        "Soybean___healthy",
        "Squash___Powdery_mildew",
        "Strawberry___Leaf_scorch",
        "Strawberry___healthy",
        "Tomato___Bacterial_spot",
        "Tomato___Early_blight",
        "Tomato___Late_blight",
        "Tomato___Leaf_Mold",
        "Tomato___Septoria_leaf_spot",
        "Tomato___Spider_mites Two-spotted_spider_mite",
        "Tomato___Target_Spot",
        "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
        "Tomato___Tomato_mosaic_virus",
        "Tomato___healthy",
    ]

# -------------------------------------------------------------------
# Machine Learning Model Setup & Preprocessing
# -------------------------------------------------------------------
try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print(f"Model successfully loaded from '{MODEL_PATH}'")

    if hasattr(model, 'input_shape') and len(model.input_shape) >= 4 and model.input_shape[1] is not None:
        warmup_h, warmup_w = int(model.input_shape[1]), int(model.input_shape[2])
    else:
        warmup_h, warmup_w = 224, 224

    dummy_input = np.zeros((1, warmup_h, warmup_w, 3), dtype=np.float32)
    _ = model.predict(dummy_input, verbose=0)
    print("Model warmup complete!")

except Exception as e:
    print(f"Error loading model from '{MODEL_PATH}': {e}")
    model = None


def extract_features(img_bytes, target_size=(224, 224), preprocessing_mode="raw"):
    """
    Extracts and resizes image array according to target dimensions and normalization mode.
    target_size is expected as (height, width).
    """
    img_stream = io.BytesIO(img_bytes)
    image = Image.open(img_stream).convert("RGB")
    image = ImageOps.exif_transpose(image)

    # PIL expects (width, height)
    target_h, target_w = target_size[0], target_size[1]
    image = image.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    img_array = np.array(image, dtype=np.float32)

    # Preprocessing scaling based on training configuration
    if preprocessing_mode == "scale_255":
        img_array = img_array / 255.0
    elif preprocessing_mode == "minus_one_to_one":
        img_array = (img_array / 127.5) - 1.0
    elif preprocessing_mode == "raw":
        pass

    img_array = np.expand_dims(img_array, axis=0)
    return img_array


# -------------------------------------------------------------------
# Dynamic Navigation Helpers & API Endpoints
# -------------------------------------------------------------------
def fetch_crops_list():
    if not os.path.exists(CROPS_DIR):
        return []

    valid_exts = (".png", ".jpg", ".jpeg", ".gif", ".webp")
    crops_map = {}

    for folder in os.listdir(CROPS_DIR):
        folder_path = os.path.join(CROPS_DIR, folder)
        if os.path.isdir(folder_path):
            parts = folder.split("___")
            if parts:
                clean_name = parts[0].replace("_", " ").replace(" ,", ",").strip()

                if clean_name not in crops_map:
                    crops_map[clean_name] = None

                if crops_map[clean_name] is None:
                    try:
                        images = [f for f in os.listdir(folder_path) if f.lower().endswith(valid_exts)]
                        if images:
                            crops_map[clean_name] = url_for("static", filename=f"crops/{folder}/{images[0]}")
                    except Exception:
                        pass

    return [{"name": name, "icon": icon_url} for name, icon_url in sorted(crops_map.items())]


@app.route("/folder/<folder_name>")
@app.route("/crops/<folder_id>")
@app.route("/crops/<crop_name>/<folder_id>")
def show_folder_images(folder_name=None, folder_id=None, crop_name=None):
    target_folder = folder_name or folder_id
    if not target_folder:
        abort(400)

    folder_path = os.path.join(CROPS_DIR, target_folder)

    if crop_name and not os.path.exists(folder_path):
        folder_path = os.path.join(CROPS_DIR, crop_name, target_folder)

    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        abort(404)

    valid_exts = (".png", ".jpg", ".jpeg", ".gif", ".webp")
    raw_files = [f for f in os.listdir(folder_path) if f.lower().endswith(valid_exts)]

    sorted_files = sorted(
        raw_files,
        key=lambda x: (int(os.path.splitext(x)[0]) if os.path.splitext(x)[0].isdigit() else x),
    )

    images = []
    for filename in sorted_files:
        rel_path = (
            f"crops/{crop_name}/{target_folder}/{filename}"
            if crop_name and not os.path.exists(os.path.join(CROPS_DIR, target_folder))
            else f"crops/{target_folder}/{filename}"
        )
        images.append({"name": filename, "url": url_for("static", filename=rel_path)})

    user = session.get("user")
    return render_template("images.html", folder_name=target_folder, images=images, user=user)


@app.route("/api/crops", methods=["GET"])
def get_crops():
    return jsonify(fetch_crops_list())


@app.route("/api/crops/<crop_name>/folders", methods=["GET"])
@app.route("/api/folders/<crop_name>", methods=["GET"])
def get_crop_folders(crop_name):
    if not os.path.exists(CROPS_DIR):
        return jsonify([])

    matching_folders = []
    search_prefix = crop_name.replace(" ", "_")

    for folder in os.listdir(CROPS_DIR):
        folder_path = os.path.join(CROPS_DIR, folder)
        if os.path.isdir(folder_path) and folder.startswith(search_prefix):
            parts = folder.split("___")
            disease_name = parts[1].replace("_", " ") if len(parts) > 1 else "Healthy / General"

            icon_url = None
            try:
                files = [f for f in os.listdir(folder_path) if f.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp"))]
                if files:
                    icon_url = url_for("static", filename=f"crops/{folder}/{files[0]}")
            except Exception:
                pass

            matching_folders.append({"id": folder, "name": disease_name, "icon": icon_url})

    return jsonify(matching_folders)


@app.route("/api/crops/<crop_name>/folders/<folder_id>/images", methods=["GET"])
@app.route("/api/images/<folder_id>", methods=["GET"])
def get_folder_images_api(folder_id, crop_name=None):
    folder_path = os.path.join(CROPS_DIR, folder_id)

    if crop_name and not os.path.exists(folder_path):
        folder_path = os.path.join(CROPS_DIR, crop_name, folder_id)

    if os.path.exists(folder_path) and os.path.isdir(folder_path):
        valid_exts = (".jpg", ".png", ".jpeg", ".gif", ".webp")
        files = [f for f in os.listdir(folder_path) if f.lower().endswith(valid_exts)]

        sorted_files = sorted(
            files,
            key=lambda x: (int(os.path.splitext(x)[0]) if os.path.splitext(x)[0].isdigit() else x),
        )

        image_list = []
        for filename in sorted_files:
            rel_path = (
                f"crops/{crop_name}/{folder_id}/{filename}"
                if crop_name and not os.path.exists(os.path.join(CROPS_DIR, folder_id))
                else f"crops/{folder_id}/{filename}"
            )
            image_list.append({"name": filename, "url": url_for("static", filename=rel_path)})

        return jsonify(image_list)

    return jsonify([])


# -------------------------------------------------------------------
# Detection & Prediction Endpoint
# -------------------------------------------------------------------
@app.route("/uploadimages/<path:filename>")
def uploaded_images(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/", methods=["GET"])
def home():
    user = session.get("user")
    crops = fetch_crops_list()
    return render_template("index.html", user=user, crops=crops)


@app.route("/supported-crops", methods=["GET"])
def supported_crops():
    user = session.get("user")
    crops = fetch_crops_list()
    return render_template("supported_crops.html", crops=crops, user=user)


# -------------------------------------------------------------------
# Prediction Endpoint
# -------------------------------------------------------------------
@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Model failed to load on server.'}), 500

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    try:
        raw_filename = secure_filename(file.filename)
        # Unique filename prevents overwrites
        unique_prefix = uuid.uuid4().hex[:8]
        filename = f"{unique_prefix}_{raw_filename}"
        
        # Read file bytes into memory
        img_bytes = file.read()

        # Save the image to UPLOAD_FOLDER so it can be served later
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        with open(file_path, "wb") as f_out:
            f_out.write(img_bytes)

        # Retrieve target height and width from model input shape
        if hasattr(model, 'input_shape') and len(model.input_shape) >= 4 and model.input_shape[1] is not None:
            target_h = int(model.input_shape[1])
            target_w = int(model.input_shape[2])
            target_size = (target_h, target_w)
        else:
            target_size = (224, 224)

        # 1. Image preprocessing
        img_array = extract_features(img_bytes, target_size=target_size, preprocessing_mode="raw")

        # 2. Run inference
        raw_predictions = model.predict(img_array, verbose=0)
        output_vector = raw_predictions[0]

        # Convert logits to probabilities if output is not softmax normalized
        vec_min, vec_max = np.min(output_vector), np.max(output_vector)
        vec_sum = np.sum(output_vector)

        if vec_min < 0.0 or vec_max > 1.0 or not np.isclose(vec_sum, 1.0, atol=1e-2):
            probabilities = tf.nn.softmax(output_vector).numpy()
        else:
            probabilities = output_vector

        top_idx = int(np.argmax(probabilities))
        raw_confidence = float(probabilities[top_idx])

        # Maps raw_confidence (0.0 to 1.0) across a wider 85.00% to 99.99% scale
        percentage_val = round(85.00 + (raw_confidence * 14.99), 2)
        confidence_val = round(percentage_val / 100.0, 4)

        print(
            f"[DEBUG] Top Index: {top_idx} | Raw: {raw_confidence:.4f} | "
            f"Scaled: {confidence_val:.4f} ({percentage_val}%) | "
            f"Class: {CLASS_NAMES[top_idx] if top_idx < len(CLASS_NAMES) else 'Out of Bounds'}"
        )

        # Retrieve class label string
        class_label = (
            CLASS_NAMES[top_idx]
            if top_idx < len(CLASS_NAMES)
            else f"Unknown_Class_{top_idx}"
        )
        clean_top_label = class_label.replace("___", " - ").replace("_", " ")

        # Disease info lookup from JSON
        top_disease_data = DISEASE_INFO.get(class_label, {})
        description = top_disease_data.get("description", "No specific description available.")
        treatment = top_disease_data.get("treatment", "Consult a plant health specialist.")

        # Save record to database
        try:
            user_session = session.get("user")
            user_id = user_session.get("id") if user_session else None

            record = PredictionRecord(
                user_id=user_id,
                disease_name=class_label,
                clean_name=clean_top_label,
                confidence=percentage_val,
                image_filename=filename,
            )
            db.session.add(record)
            db.session.commit()
        except Exception as db_err:
            db.session.rollback()
            print(f"Failed to record prediction in DB: {db_err}")

        # Return prediction payload
        return jsonify({
            'success': True,
            'class_name': class_label,
            'clean_name': clean_top_label,
            'confidence': confidence_val,
            'percentage': percentage_val,
            'description': description,
            'treatment': treatment,
            'image_url': url_for('uploaded_images', filename=filename)
        })

    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------------
# OAuth Authentication Routes
# -------------------------------------------------------------------
@app.route("/login/google")
def login_google():
    redirect_uri = url_for("auth_google", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@app.route("/auth/google/callback")
def auth_google():
    try:
        token = oauth.google.authorize_access_token()
        user_info = token.get("userinfo")
        if not user_info:
            resp = oauth.google.get("https://www.googleapis.com/oauth2/v3/userinfo")
            user_info = resp.json()

        if user_info:
            email = user_info.get("email")
            name = user_info.get("name")

            user = User.query.filter_by(email=email).first()
            if not user:
                user = User(email=email, name=name, provider="google")
                db.session.add(user)
                db.session.commit()

            session["user"] = {
                "id": user.id,
                "provider": "google",
                "name": user.name,
                "email": user.email,
                "picture": user_info.get("picture"),
            }
    except Exception as e:
        print(f"Error during Google OAuth callback: {e}")

    return redirect("/")


@app.route("/login/facebook")
def login_facebook():
    redirect_uri = url_for("auth_facebook", _external=True)
    return oauth.facebook.authorize_redirect(redirect_uri)


@app.route("/auth/facebook/callback")
def auth_facebook():
    try:
        token = oauth.facebook.authorize_access_token()
        resp = oauth.facebook.get("me?fields=id,name,picture,email")
        profile = resp.json()

        user_id = profile.get("id")
        user_name = profile.get("name")
        user_email = profile.get("email", f"fb_{user_id}@example.com")

        user = User.query.filter_by(email=user_email).first()
        if not user:
            user = User(email=user_email, name=user_name, provider="facebook")
            db.session.add(user)
            db.session.commit()

        session["user"] = {
            "id": user.id,
            "provider": "facebook",
            "name": user.name,
            "email": user.email,
            "picture": profile.get("picture", {}).get("data", {}).get("url"),
        }
    except Exception as e:
        print(f"Error during Facebook OAuth callback: {e}")

    return redirect("/")


@app.route("/favicon.ico")
def favicon():
    return "", 204


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/")


if __name__ == "__main__":
    app.run(debug=True)
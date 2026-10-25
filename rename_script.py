import os

TARGET_DIR = os.path.join("static", "crops")
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def batch_rename(base_path):
    for root, _, files in os.walk(base_path):
        # Find and sort valid images
        imgs = sorted([f for f in files if f.lower().endswith(EXTS)])
        if not imgs:
            continue

        temp_files = []

        # Step 1: Rename to temporary names (temp_1.jpg, temp_2.png, ...)
        for i, fname in enumerate(imgs, 1):
            ext = os.path.splitext(fname)[1].lower()
            old_path = os.path.join(root, fname)
            temp_name = f"temp_{i}{ext}"
            temp_path = os.path.join(root, temp_name)

            os.rename(old_path, temp_path)
            temp_files.append((temp_name, ext))

        # Step 2: Final sequential rename (1.jpg, 2.png, ...)
        for i, (temp_name, ext) in enumerate(temp_files, 1):
            temp_path = os.path.join(root, temp_name)
            final_path = os.path.join(root, f"{i}{ext}")

            os.rename(temp_path, final_path)

        print(f"Renamed {len(imgs)} files in: {root}")


if __name__ == "__main__":
    if os.path.exists(TARGET_DIR):
        batch_rename(TARGET_DIR)
        print("Batch renaming completed successfully!")
    else:
        print(f"Error: '{TARGET_DIR}' directory not found.")
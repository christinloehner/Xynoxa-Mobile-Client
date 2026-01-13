# Xynoxa Mobile Client

Mobile app for Android/iOS (Expo). Focus:
- View and manage files (download, delete, copy, move)
- Automatic photo upload from selected albums with target path

## Official Links

This is the Xynoxa control center: website and all three repos bundled, so you can instantly find the right app.

- Xynoxa Website: https://www.xynoxa.com
- Xynoxa Cloud App: https://github.com/christinloehner/Xynoxa-Cloud
- Xynoxa Desktop Client: https://github.com/christinloehner/Xynoxa-Desktop-Client
- Xynoxa Mobile Client: https://github.com/christinloehner/Xynoxa-Mobile-Client

## ATTENTION  ATTENTION  ATTENTION  ATTENTION  ATTENTION 

Warning! This application is still under development and definitely not recommended for daily use! Currently, it is only recommended to install the application for testing purposes and not to use it in production!

**Warning! Expect data loss when testing this application!**


## Start
```
npm install
npm run start
```

## Login
The app uses login via email + password. On first login an API token is created
and stored locally.

## Auto-Upload
- Enable auto-upload
- Enable an album
- Set a target path in the cloud (e.g. `Photos/Vacation`)
- Optional: group folders by prefixing the group name (e.g. `Team/Photos`)

Android: There is a native background worker that continues after the app is
closed and after reboot. The interval is system-defined (min. 15 minutes).
iOS: Apple does not allow permanent background processes; uploads run via
system-managed background tasks.

## Local Build (Android APK)

### Prerequisites
- Android Studio incl. Android SDK + Platform Tools
- `JAVA_HOME` set (JDK 17 recommended for RN 0.74)
- `ANDROID_HOME` set (or `ANDROID_SDK_ROOT`)
- `adb` in PATH

If Gradle complains: create `android/local.properties` with the SDK path:
```
sdk.dir=/path/to/Android/Sdk
```

Important for builds:
- NDK version: `25.2.9519653`
- Min SDK: `23`
These values must be set in `android/gradle.properties`:
```
android.minSdkVersion=23
android.ndkVersion=25.2.9519653
```

If the NDK is missing, install it in Android Studio via SDK Manager
or via sdkmanager:
```
sdkmanager "ndk;25.2.9519653"
```

### Quick start (debug APK, runnable without keystore)
```
npm install
npx expo prebuild --platform android
cat android/gradle.properties
cd android
./gradlew assembleDebug
```
APK path:
```
android/app/build/outputs/apk/debug/app-debug.apk
```
Install:
```
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 1) Install dependencies
```
npm install
```

### 2) Generate native projects
```
npx expo prebuild --platform android
```
This creates the `android/` folder with the Gradle project.

### 3) Create release keystore
```
keytool -genkeypair -v \
  -keystore android/app/xynoxa-release.keystore \
  -alias xynoxa \
  -keyalg RSA -keysize 2048 -validity 10000
```
Remember password + alias.

### 4) Add keystore to Gradle
Create `android/keystores.properties`:
```
MYAPP_UPLOAD_STORE_FILE=xynoxa-release.keystore
MYAPP_UPLOAD_KEY_ALIAS=xynoxa
MYAPP_UPLOAD_STORE_PASSWORD=YOUR_PASSWORD
MYAPP_UPLOAD_KEY_PASSWORD=YOUR_PASSWORD
```

Update `android/app/build.gradle` (if Expo did not already set it):
```
android {
  signingConfigs {
    release {
      if (project.hasProperty("MYAPP_UPLOAD_STORE_FILE")) {
        storeFile file(MYAPP_UPLOAD_STORE_FILE)
        storePassword MYAPP_UPLOAD_STORE_PASSWORD
        keyAlias MYAPP_UPLOAD_KEY_ALIAS
        keyPassword MYAPP_UPLOAD_KEY_PASSWORD
      }
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
    }
  }
}
```
And load the properties in `android/gradle.properties`:
```
MYAPP_UPLOAD_STORE_FILE=xynoxa-release.keystore
MYAPP_UPLOAD_KEY_ALIAS=xynoxa
MYAPP_UPLOAD_STORE_PASSWORD=YOUR_PASSWORD
MYAPP_UPLOAD_KEY_PASSWORD=YOUR_PASSWORD
```

### 5) Build release APK
```
cd android
./gradlew assembleRelease
```
The APK will be here:
```
android/app/build/outputs/apk/release/app-release.apk
```

### 6) Install APK (optional)
```
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Local Build (iOS)

### Prerequisites
- macOS with Xcode
- CocoaPods (`sudo gem install cocoapods`)

### Steps
```
npm install
npx expo prebuild --platform ios
cd ios
pod install
```
Then open `ios/Xynoxa.xcworkspace` in Xcode, set signing, and archive.

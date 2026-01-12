#!/bin/bash

npx expo prebuild --platform android ; cd android ; ./gradlew assembleRelease ; adb install -r app/build/outputs/apk/release/app-release.apk ; cd ..




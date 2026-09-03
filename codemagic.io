workflows:
  react-native-android:
    name: Build Android APK
    max_build_duration: 30
    instance_type: mac_mini_m1
    environment:
      node: latest
    scripts:
      - name: Install dependencies
        script: |
          npm install
      - name: Build Android APK
        script: |
          cd android && ./gradlew assembleRelease
    artifacts:
      - android/app/build/outputs/apk/**/*.apk

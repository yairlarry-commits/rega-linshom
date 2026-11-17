// Prepares the Android project for background reminders:
// 1. copies the anchor sound into res/raw so notifications can play it
// 2. adds the permissions needed for exact, scheduled notifications
const fs = require("fs");
const path = require("path");

const androidMain = path.join(__dirname, "android", "app", "src", "main");
if (!fs.existsSync(androidMain)) {
  console.error("Android project not found. Run: npx cap add android");
  process.exit(1);
}

const rawDir = path.join(androidMain, "res", "raw");
fs.mkdirSync(rawDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, "www", "chime.mp3"), path.join(rawDir, "chime.mp3"));
console.log("Copied chime.mp3 to res/raw");

const manifestPath = path.join(androidMain, "AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
const perms = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.WAKE_LOCK",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
];
let added = 0;
// Android 13+: USE_EXACT_ALARM is granted automatically, so reminders fire on time
// instead of being delayed or dropped by battery saving.
if (!manifest.includes('"android.permission.USE_EXACT_ALARM"')) {
  manifest = manifest.replace("</manifest>", '    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />\n</manifest>');
  added++;
}
for (const p of perms) {
  if (!manifest.includes(`"${p}"`)) {
    manifest = manifest.replace("</manifest>", `    <uses-permission android:name="${p}" />\n</manifest>`);
    added++;
  }
}
fs.writeFileSync(manifestPath, manifest);
console.log(`Permissions added: ${added}`);

// Ask Android to stop "optimizing" (killing) the app in the background,
// so scheduled reminders are not wiped when the app is closed.
const javaDir = path.join(androidMain, "java", "com", "regalinshom", "app");
fs.mkdirSync(javaDir, { recursive: true });
fs.writeFileSync(path.join(javaDir, "MainActivity.java"), `package com.regalinshom.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RegaSystemPlugin.class);
        super.onCreate(savedInstanceState);
        new Handler(Looper.getMainLooper()).postDelayed(this::askToRunInBackground, 1500);
    }

    private void askToRunInBackground() {
        try {
            if (Build.VERSION.SDK_INT < 23) return;
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            SharedPreferences prefs = getSharedPreferences("rega", MODE_PRIVATE);
            int asked = prefs.getInt("batteryAsked", 0);
            if (asked >= 3) return;
            prefs.edit().putInt("batteryAsked", asked + 1).apply();
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignored) {}
    }
}
`);
fs.writeFileSync(path.join(javaDir, "RegaSystemPlugin.java"), `package com.regalinshom.app;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RegaSystem")
public class RegaSystemPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        boolean battery = true;
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            battery = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            exact = am != null && am.canScheduleExactAlarms();
        }
        r.put("batteryUnrestricted", battery);
        r.put("exactAlarms", exact);
        call.resolve(r);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + ctx.getPackageName()));
            getActivity().startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + ctx.getPackageName()));
            getActivity().startActivity(i);
        }
        call.resolve();
    }
}
`);
console.log("Wrote MainActivity with background permission request");

// Give every build a higher version number, so Android always treats it as an update.
const run = parseInt(process.env.GITHUB_RUN_NUMBER || "0", 10);
if (run > 0) {
  const gradlePath = path.join(__dirname, "android", "app", "build.gradle");
  let gradle = fs.readFileSync(gradlePath, "utf8");
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${run}`).replace(/versionName\s+"[^"]*"/, `versionName "1.${run}"`);
  fs.writeFileSync(gradlePath, gradle);
  console.log(`Version set to 1.${run} (code ${run})`);
}

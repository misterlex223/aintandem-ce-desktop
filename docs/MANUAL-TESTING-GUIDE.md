# AInTandem Desktop - Manual Testing Guide

This document provides comprehensive manual testing procedures for all features of AInTandem Desktop. Follow these test cases to verify functionality before release.

## Table of Contents

1. [Pre-Testing Setup](#pre-testing-setup)
2. [Phase 1-5: Core Functionality Tests](#phase-1-5-core-functionality-tests)
3. [Phase 6: Containerd Runtime Tests](#phase-6-containerd-runtime-tests)
4. [Phase 7: Advanced Features Tests](#phase-7-advanced-features-tests)
5. [Phase 8: Polish & Production Tests](#phase-8-polish--production-tests)
6. [Platform-Specific Tests](#platform-specific-tests)
7. [Regression Tests](#regression-tests)
8. [Performance Tests](#performance-tests)

---

## Pre-Testing Setup

### Environment Preparation

**Test Matrix:**
- macOS (Intel + Apple Silicon)
- Windows 10/11
- Linux (Ubuntu 20.04+)

**Required Tools:**
- Docker Desktop (for Docker runtime tests)
- No Docker Desktop (for containerd tests)
- Terminal/PowerShell access
- Resource monitoring tools (Activity Monitor, Task Manager, htop)

### Build Verification

**TC-BUILD-001: Clean Build**
```bash
cd kai-desktop
rm -rf node_modules out dist
pnpm install
pnpm build
```

**Expected Result:**
- ✅ No TypeScript errors
- ✅ No build warnings
- ✅ Build completes successfully
- ✅ `out/` directory contains compiled files

**TC-BUILD-002: Production Package**
```bash
pnpm package
```

**Expected Result:**
- ✅ Application packaged successfully
- ✅ Installer/DMG/AppImage created in `dist/`
- ✅ File size reasonable (~200-400MB depending on platform)

---

## Phase 1-5: Core Functionality Tests

### Test Group: Application Launch

**TC-CORE-001: First Launch with Docker**

**Prerequisites:** Docker Desktop running

**Steps:**
1. Launch AInTandem Desktop for the first time
2. Observe runtime detection
3. Check initialization logs

**Expected Result:**
- ✅ App window appears within 5 seconds
- ✅ Console shows "Detected runtime: docker"
- ✅ Dashboard loads successfully
- ✅ No error messages in console

**TC-CORE-002: First Launch without Docker**

**Prerequisites:** Docker Desktop NOT running

**Steps:**
1. Stop Docker Desktop
2. Launch AInTandem Desktop
3. Observe runtime detection

**Expected Result:**
- ✅ App window appears
- ✅ Console shows "Detected runtime: containerd" or "No runtime available"
- ✅ Error message if containerd not bundled
- ✅ App doesn't crash

**TC-CORE-003: Subsequent Launch**

**Steps:**
1. Launch AInTandem Desktop (already configured)
2. Observe load time

**Expected Result:**
- ✅ App launches in <3 seconds
- ✅ Previous runtime selection remembered
- ✅ Dashboard state restored
- ✅ No unnecessary reinitialization

### Test Group: Configuration System

**TC-CONFIG-001: Settings Panel Access**

**Steps:**
1. Launch AInTandem Desktop
2. Click ⚙️ Settings button (top-right)
3. Observe settings modal

**Expected Result:**
- ✅ Settings modal opens
- ✅ All sections visible
- ✅ Current settings displayed correctly
- ✅ Close button works

**TC-CONFIG-002: Runtime Selection**

**Prerequisites:** Both Docker and containerd available

**Steps:**
1. Open Settings
2. Change runtime from Docker to containerd
3. Save settings
4. Restart app

**Expected Result:**
- ✅ Settings saved successfully
- ✅ App restarts with new runtime
- ✅ Console shows "Using runtime: containerd"
- ✅ Services work with new runtime

**TC-CONFIG-003: Invalid Configuration**

**Steps:**
1. Open Settings
2. Enter invalid path for Docker binary
3. Save and restart

**Expected Result:**
- ✅ Error message shown
- ✅ Falls back to auto-detection
- ✅ App doesn't crash
- ✅ User notified of issue

### Test Group: Service Infrastructure

**TC-INFRA-001: Network Creation**

**Prerequisites:** Fresh Docker/containerd installation

**Steps:**
1. Launch AInTandem Desktop (first time)
2. Wait for initialization
3. Verify network creation:
   ```bash
   docker network ls | grep kai-net
   ```

**Expected Result:**
- ✅ `kai-net` network exists
- ✅ Driver: bridge
- ✅ No errors in console

**TC-INFRA-002: Volume Creation**

**Steps:**
1. Launch AInTandem Desktop (first time)
2. Verify volumes created:
   ```bash
   docker volume ls | grep kai
   ```

**Expected Result:**
- ✅ `kai-data` volume exists
- ✅ Volumes are empty (first launch)

**TC-INFRA-003: Infrastructure Reuse**

**Steps:**
1. Launch AInTandem Desktop (subsequent launch)
2. Check console logs

**Expected Result:**
- ✅ "Network already exists" logged
- ✅ "Volume already exists" logged
- ✅ No duplication
- ✅ No errors

---

## Phase 6: Containerd Runtime Tests

### Test Group: Runtime Detection

**TC-CONT-001: Containerd Auto-Detection**

**Prerequisites:** Docker Desktop stopped, containerd available

**Steps:**
1. Stop Docker Desktop
2. Launch AInTandem Desktop
3. Check runtime detection

**Expected Result:**
- ✅ Console shows "Detected runtime: containerd"
- ✅ ContainerdAdapter initialized
- ✅ nerdctl command available
- ✅ No errors

**TC-CONT-002: Runtime Switching**

**Steps:**
1. Start with Docker runtime
2. Stop Docker Desktop
3. Restart AInTandem Desktop

**Expected Result:**
- ✅ Auto-switches to containerd
- ✅ Console shows runtime change
- ✅ Services migrate successfully
- ✅ No data loss

**TC-CONT-003: Containerd Operations**

**Prerequisites:** Using containerd runtime

**Steps:**
1. Start a service (e.g., Backend)
2. Stop the service
3. View logs
4. Remove container

**Expected Result:**
- ✅ All operations work via nerdctl
- ✅ No errors in console
- ✅ Container states correct
- ✅ Logs viewable

### Test Group: Image Bundling

**TC-IMG-001: Bundled Image Loading**

**Prerequisites:** Fresh containerd install, no images loaded

**Steps:**
1. Launch AInTandem Desktop (first time with containerd)
2. Observe image loading process
3. Verify images:
   ```bash
   nerdctl images
   ```

**Expected Result:**
- ✅ Console shows "Loading bundled images"
- ✅ Backend image loaded successfully
- ✅ Loading completes in <60 seconds
- ✅ Images appear in nerdctl images list

**TC-IMG-002: Image Loading Skip**

**Prerequisites:** Images already loaded

**Steps:**
1. Launch AInTandem Desktop (subsequent launch)
2. Check console logs

**Expected Result:**
- ✅ "Images already loaded" message
- ✅ No re-loading
- ✅ Fast startup

**TC-IMG-003: Image Manifest Validation**

**Steps:**
1. Check bundled image manifest:
   ```bash
   cat resources/images/manifest.json
   ```
2. Verify manifest fields

**Expected Result:**
- ✅ Manifest exists
- ✅ Contains image names, tags, filenames
- ✅ Version information present
- ✅ JSON is valid

---

## Phase 7: Advanced Features Tests

### Test Group: Log Viewer

**TC-LOG-001: Open Log Viewer**

**Prerequisites:** At least one service running

**Steps:**
1. Go to Services tab
2. Click "View Logs" on running service
3. Observe log viewer modal

**Expected Result:**
- ✅ Modal opens in <1 second
- ✅ Logs displayed (if any)
- ✅ Dark theme applied
- ✅ All controls visible

**TC-LOG-002: Real-Time Log Streaming**

**Steps:**
1. Open log viewer for a service
2. Generate new logs (trigger service action)
3. Wait 2 seconds
4. Observe log updates

**Expected Result:**
- ✅ New logs appear automatically
- ✅ Auto-scroll to bottom
- ✅ No lag or freezing
- ✅ Timestamps accurate

**TC-LOG-003: Log Search**

**Prerequisites:** Service with logs containing "error"

**Steps:**
1. Open log viewer
2. Type "error" in search box
3. Observe filtering

**Expected Result:**
- ✅ Only matching lines shown
- ✅ Search is case-insensitive
- ✅ Clear search works
- ✅ No performance issues

**TC-LOG-004: Line Limit Controls**

**Steps:**
1. Open log viewer
2. Select "100 lines" from dropdown
3. Switch to "All lines"
4. Observe changes

**Expected Result:**
- ✅ Limit applied correctly
- ✅ "All lines" shows everything
- ✅ Dropdown updates
- ✅ Logs refresh

**TC-LOG-005: Timestamp Toggle**

**Steps:**
1. Open log viewer
2. Toggle "Show Timestamps" checkbox
3. Observe log format changes

**Expected Result:**
- ✅ Timestamps appear/disappear
- ✅ Format: `YYYY-MM-DD HH:mm:ss`
- ✅ Toggle is smooth
- ✅ Layout doesn't break

**TC-LOG-006: Download Logs**

**Steps:**
1. Open log viewer
2. Click "Download" button
3. Check downloaded file

**Expected Result:**
- ✅ File save dialog appears
- ✅ Default filename: `{service}-logs-{timestamp}.txt`
- ✅ File contains all logs
- ✅ File is readable

**TC-LOG-007: Copy Logs**

**Steps:**
1. Open log viewer
2. Click "Copy" button
3. Paste into text editor

**Expected Result:**
- ✅ "Copied!" message appears
- ✅ Clipboard contains logs
- ✅ Format preserved
- ✅ All visible logs copied

**TC-LOG-008: Empty Logs**

**Prerequisites:** Service with no logs

**Steps:**
1. Start a fresh service
2. Open log viewer immediately

**Expected Result:**
- ✅ "No logs available" message
- ✅ No errors
- ✅ Auto-refresh still works
- ✅ Modal remains functional

### Test Group: System Tray

**TC-TRAY-001: Tray Icon Appears**

**Steps:**
1. Launch AInTandem Desktop
2. Check system tray/menu bar

**Expected Result:**
- ✅ AInTandem Desktop icon appears
- ✅ Icon is visible and clear
- ✅ Platform-appropriate location

**TC-TRAY-002: Tray Menu**

**Steps:**
1. Click/right-click tray icon
2. Observe menu contents

**Expected Result:**
- ✅ Menu opens
- ✅ Shows service statuses
- ✅ Shows running count (e.g., "2/3 services running")
- ✅ "Show"/"Hide" option
- ✅ "Quit" option

**TC-TRAY-003: Service Status Indicators**

**Prerequisites:** Mix of running and stopped services

**Steps:**
1. Open tray menu
2. Check service status indicators

**Expected Result:**
- ✅ Running services: ✓ icon
- ✅ Stopped services: ■ icon
- ✅ Service names displayed
- ✅ Updates every 30 seconds

**TC-TRAY-004: Quick Start/Stop**

**Steps:**
1. Open tray menu
2. Click "Start" on a stopped service
3. Wait for update

**Expected Result:**
- ✅ Service starts successfully
- ✅ Menu updates to show running status
- ✅ No errors
- ✅ Tray menu remains open

**TC-TRAY-005: Show/Hide Window**

**Steps:**
1. Click "Hide" from tray menu
2. Click "Show" from tray menu

**Expected Result:**
- ✅ Window hides/shows correctly
- ✅ App continues running when hidden
- ✅ State preserved
- ✅ No flickering

**TC-TRAY-006: Quit from Tray**

**Steps:**
1. Click "Quit" from tray menu
2. Observe shutdown

**Expected Result:**
- ✅ App quits gracefully
- ✅ Cleanup tasks run
- ✅ Services remain running (if configured)
- ✅ No zombie processes

### Test Group: Service Health Dashboard

**TC-HEALTH-001: Dashboard Display**

**Steps:**
1. Go to Health Dashboard tab
2. Observe layout

**Expected Result:**
- ✅ Overview stats cards visible
- ✅ Dependency graph shown
- ✅ Health status table displayed
- ✅ No layout issues

**TC-HEALTH-002: Overview Stats**

**Prerequisites:** Mix of service states (running, stopped, error)

**Steps:**
1. View overview stats cards
2. Verify counts

**Expected Result:**
- ✅ Total services count correct
- ✅ Running count accurate
- ✅ Stopped count accurate
- ✅ Error count accurate (if any)
- ✅ Color coding: green (running), gray (stopped), red (error)

**TC-HEALTH-003: Dependency Graph**

**Steps:**
1. View dependency graph section
2. Identify service relationships

**Expected Result:**
- ✅ All services shown as nodes
- ✅ Backend shows no dependencies
- ✅ Status colors correct (green/gray/red)
- ✅ "Essential" badges visible
- ✅ "Depends on:" labels clear

**TC-HEALTH-004: Health Status Table**

**Steps:**
1. View health status table
2. Check all columns

**Expected Result:**
- ✅ All services listed
- ✅ Status badges color-coded
- ✅ Health indicators accurate
- ✅ Essential/Optional tags correct
- ✅ Dependency counts shown

**TC-HEALTH-005: Real-Time Updates**

**Steps:**
1. Open Health Dashboard
2. Start a stopped service (from another tab)
3. Wait 10 seconds
4. Observe dashboard update

**Expected Result:**
- ✅ Stats cards update
- ✅ Dependency graph colors change
- ✅ Table status updates
- ✅ No manual refresh needed

**TC-HEALTH-006: Empty State**

**Prerequisites:** No services running

**Steps:**
1. Stop all services
2. View Health Dashboard

**Expected Result:**
- ✅ Stats show 0 running
- ✅ All nodes gray in dependency graph
- ✅ Table shows all stopped
- ✅ No errors displayed

---

## Phase 8: Polish & Production Tests

### Test Group: Auto-Recovery System

**TC-AUTO-001: Essential Service Auto-Restart**

**Prerequisites:** All services running

**Steps:**
1. Open Services tab
2. Manually kill a running essential service container:
   ```bash
   docker kill {container-id}
   ```
3. Wait 15 seconds
4. Check console logs

**Expected Result:**
- ✅ Console shows "Auto-restarting essential service: {name} (attempt 1/3)"
- ✅ Service restarts automatically
- ✅ UI updates to show "starting" then "running"
- ✅ No manual intervention needed

**TC-AUTO-002: Max Restart Attempts**

**Steps:**
1. Cause a service to fail repeatedly (e.g., corrupt config)
2. Wait 60 seconds
3. Check console logs

**Expected Result:**
- ✅ Service restarts attempted 3 times
- ✅ Console shows "Max restart attempts reached for {name}"
- ✅ Service shows "error" status
- ✅ No infinite restart loop

**TC-AUTO-003: Successful Restart Resets Counter**

**Steps:**
1. Cause service to fail once
2. Let it auto-restart successfully
3. Cause it to fail again
4. Check restart attempt count

**Expected Result:**
- ✅ First failure: attempt 1/3
- ✅ Successful restart resets to 0
- ✅ Second failure: attempt 1/3 (not 2/3)
- ✅ Counter logic correct

**TC-AUTO-004: Non-Essential Services Not Auto-Restarted**

**Prerequisites:** Non-essential service exists (optional service)

**Steps:**
1. Stop optional service
2. Wait 30 seconds
3. Check console and UI

**Expected Result:**
- ✅ Service stays stopped
- ✅ No auto-restart attempt
- ✅ Console: no auto-restart messages
- ✅ Manual restart still works

**TC-AUTO-005: User-Stopped Services Not Auto-Restarted**

**Steps:**
1. Manually stop an essential service via UI
2. Wait 30 seconds
3. Check status

**Expected Result:**
- ✅ Service stays stopped
- ✅ No auto-restart (respects user action)
- ✅ Health monitoring continues
- ✅ Manual start works

**TC-AUTO-006: Health Monitoring on App Launch**

**Steps:**
1. Close AInTandem Desktop
2. Relaunch app
3. Check console logs

**Expected Result:**
- ✅ Console shows "Starting health monitoring with auto-restart"
- ✅ Monitoring starts automatically
- ✅ 15-second interval active
- ✅ No duplicate intervals

**TC-AUTO-007: Disable Auto-Restart**

**Prerequisites:** Settings panel with auto-restart toggle

**Steps:**
1. Open Settings
2. Disable "Auto-restart essential services"
3. Kill an essential service
4. Wait 30 seconds

**Expected Result:**
- ✅ Service stays stopped
- ✅ No auto-restart
- ✅ Health monitoring may still run
- ✅ Re-enabling works


### Test Group: Performance Optimization

**TC-PERF-001: Polling Interval Verification**

**Steps:**
1. Open Services tab
2. Monitor console network/API calls
3. Count requests over 60 seconds

**Expected Result:**
- ✅ Services tab: ~6 requests in 60 seconds (10s interval)
- ✅ Health Dashboard: ~6 requests in 60 seconds (10s interval)
- ✅ Container tab: ~6 requests in 60 seconds (10s interval)
- ✅ Not the old 5s interval (~12 requests)

**TC-PERF-002: Health Monitoring Interval**

**Steps:**
1. Launch app
2. Monitor console logs for health check messages
3. Measure time between checks

**Expected Result:**
- ✅ Health checks every 15 seconds
- ✅ Console shows timestamps
- ✅ Interval consistent
- ✅ No missed checks

**TC-PERF-003: Tray Menu Update Rate**

**Steps:**
1. Open tray menu
2. Keep it open for 60 seconds
3. Monitor update frequency

**Expected Result:**
- ✅ Updates every 30 seconds
- ✅ No constant flickering
- ✅ Status stays accurate
- ✅ Low CPU usage

**TC-PERF-004: CPU Usage (Idle)**

**Prerequisites:** App running, all services stopped, no modals open

**Steps:**
1. Let app sit idle for 2 minutes
2. Check CPU usage in Activity Monitor/Task Manager

**Expected Result:**
- ✅ CPU usage <5% on average
- ✅ No spinning/high CPU spikes
- ✅ Memory stable
- ✅ No leaks

**TC-PERF-005: CPU Usage (Active)**

**Prerequisites:** All services running, log viewer open

**Steps:**
1. Open log viewer
2. Monitor CPU usage for 1 minute

**Expected Result:**
- ✅ CPU usage <20% on average
- ✅ Acceptable during log streaming
- ✅ No excessive polling
- ✅ Responsive UI

**TC-PERF-006: Memory Usage**

**Steps:**
1. Launch app
2. Run for 10 minutes with normal usage
3. Check memory in Activity Monitor/Task Manager

**Expected Result:**
- ✅ Memory usage <300MB
- ✅ No continuous growth
- ✅ Stable over time
- ✅ No memory leaks

**TC-PERF-007: Cleanup on Component Unmount**

**Steps:**
1. Open Services tab (starts polling)
2. Switch to Health Dashboard tab
3. Check console for cleanup

**Expected Result:**
- ✅ Old interval cleared
- ✅ New interval started
- ✅ No duplicate intervals
- ✅ No console warnings

**TC-PERF-008: Startup Time**

**Steps:**
1. Quit app completely
2. Measure time from launch to usable UI

**Expected Result:**
- ✅ First launch: <10 seconds
- ✅ Subsequent launch: <3 seconds
- ✅ No long freezes
- ✅ UI responsive during load

### Test Group: Documentation

**TC-DOC-001: README Completeness**

**Steps:**
1. Read `README.md`
2. Follow installation instructions
3. Try troubleshooting scenarios

**Expected Result:**
- ✅ All features documented
- ✅ Installation steps clear
- ✅ Troubleshooting helpful
- ✅ No broken links

**TC-DOC-002: Manual Testing Guide**

**Steps:**
1. Read this document
2. Follow test cases
3. Check for ambiguities

**Expected Result:**
- ✅ All test cases clear
- ✅ Expected results defined
- ✅ Prerequisites stated
- ✅ No missing information

**TC-DOC-003: Inline Help**

**Prerequisites:** Settings panel has help text

**Steps:**
1. Open Settings
2. Hover over info icons (if any)
3. Read tooltips

**Expected Result:**
- ✅ Help text accurate
- ✅ Tooltips appear
- ✅ Language clear
- ✅ No technical jargon

---

## Platform-Specific Tests

### macOS Specific

**TC-MAC-001: DMG Installation**

**Steps:**
1. Download `.dmg` file
2. Mount DMG
3. Drag to Applications
4. Launch from Applications

**Expected Result:**
- ✅ DMG mounts successfully
- ✅ Drag-and-drop works
- ✅ App launches from Applications
- ✅ No security warnings (if signed)

**TC-MAC-002: Apple Silicon Compatibility**

**Prerequisites:** M1/M2 Mac

**Steps:**
1. Install and launch app
2. Check Activity Monitor architecture

**Expected Result:**
- ✅ Runs natively (not Rosetta)
- ✅ "Kind: Apple" in Activity Monitor
- ✅ Performance optimized
- ✅ No compatibility issues

**TC-MAC-003: macOS Permissions**

**Steps:**
1. First launch
2. Check permission prompts

**Expected Result:**
- ✅ No unnecessary permission requests
- ✅ Docker socket access works
- ✅ File system access minimal
- ✅ User notified if needed

### Windows Specific

**TC-WIN-001: EXE Installation**

**Steps:**
1. Run `.exe` installer
2. Follow installation wizard
3. Launch from Start menu

**Expected Result:**
- ✅ Installer runs without admin (if possible)
- ✅ Installation completes successfully
- ✅ Start menu shortcut created
- ✅ Desktop shortcut optional

**TC-WIN-002: Windows Defender**

**Steps:**
1. Install app
2. Check Windows Defender alerts

**Expected Result:**
- ✅ No malware warnings
- ✅ Installer trusted (if signed)
- ✅ App runs without SmartScreen issues

**TC-WIN-003: Docker Desktop Integration**

**Prerequisites:** Docker Desktop for Windows

**Steps:**
1. Verify Docker Desktop running
2. Launch AInTandem Desktop
3. Check runtime detection

**Expected Result:**
- ✅ Docker detected via named pipe
- ✅ Container operations work
- ✅ No permission issues

### Linux Specific

**TC-LIN-001: AppImage Execution**

**Steps:**
1. Download `.AppImage`
2. Make executable: `chmod +x *.AppImage`
3. Run: `./KaiDesktop.AppImage`

**Expected Result:**
- ✅ App runs without installation
- ✅ No missing dependencies
- ✅ Works on Ubuntu 20.04+

**TC-LIN-002: DEB Installation**

**Prerequisites:** Debian/Ubuntu system

**Steps:**
1. Install: `sudo dpkg -i *.deb`
2. Launch from applications menu

**Expected Result:**
- ✅ Installation succeeds
- ✅ Dependencies resolved
- ✅ Desktop entry created

**TC-LIN-003: Docker Socket Permissions**

**Steps:**
1. Launch app as non-root user
2. Check Docker access

**Expected Result:**
- ✅ Works if user in `docker` group
- ✅ Clear error if no permissions
- ✅ Suggestion to run `sudo usermod -aG docker $USER`

---

## Regression Tests

### Test Group: Existing Features Still Work

**TC-REG-001: Basic Service Start/Stop**

**Steps:**
1. Start Backend service
2. Stop Backend service
3. Verify state changes

**Expected Result:**
- ✅ Start works (Phase 1-5 functionality)
- ✅ Stop works
- ✅ UI updates correctly

**TC-REG-002: Container List**

**Steps:**
1. Go to Containers tab
2. View container list

**Expected Result:**
- ✅ All containers listed
- ✅ Details accurate
- ✅ Actions work (start/stop/remove)

**TC-REG-003: Configuration Persistence**

**Steps:**
1. Change runtime setting
2. Restart app
3. Check setting

**Expected Result:**
- ✅ Setting persisted
- ✅ Config file intact
- ✅ No data loss

**TC-REG-004: Multi-Service Operations**

**Steps:**
1. Click "Start All"
2. Wait for completion
3. Click "Stop All"

**Expected Result:**
- ✅ All services start in order
- ✅ Dependencies respected
- ✅ Stop all works
- ✅ No stragglers

---

## Performance Tests

### Test Group: Load and Stress

**TC-LOAD-001: Many Containers**

**Prerequisites:** 10+ containers created

**Steps:**
1. Launch app
2. Load container list
3. Measure performance

**Expected Result:**
- ✅ UI responsive
- ✅ List renders in <2 seconds
- ✅ No lag when scrolling
- ✅ Actions still work

**TC-LOAD-002: Long-Running App**

**Steps:**
1. Launch app
2. Leave running for 8 hours
3. Check memory and CPU

**Expected Result:**
- ✅ No memory leaks
- ✅ CPU usage stable
- ✅ UI still responsive
- ✅ Auto-restart still works

**TC-LOAD-003: Rapid Service Restarts**

**Steps:**
1. Restart Backend service 10 times in a row
2. Observe behavior

**Expected Result:**
- ✅ All restarts succeed
- ✅ No race conditions
- ✅ UI updates correctly each time
- ✅ No errors

**TC-LOAD-004: Log Viewer with Large Logs**

**Prerequisites:** Service with 10,000+ log lines

**Steps:**
1. Open log viewer
2. Select "All lines"
3. Scroll through logs

**Expected Result:**
- ✅ Logs load (may take a few seconds)
- ✅ Scrolling smooth (virtualized if needed)
- ✅ Search still works
- ✅ No UI freeze

---

## Test Result Template

For each test case, record results using this template:

```
Test Case ID: TC-XXX-###
Date: YYYY-MM-DD
Tester: [Name]
Platform: [macOS/Windows/Linux]
Runtime: [Docker/Containerd]

Result: [PASS/FAIL/BLOCKED]

Notes:
- [Any observations]
- [Deviations from expected results]
- [Screenshots/logs if failure]

Issues Found:
- [Link to bug ticket if any]
```

---

## Reporting Issues

When reporting bugs found during testing:

1. **Title**: Clear, concise description
2. **Severity**: Critical / High / Medium / Low
3. **Steps to Reproduce**: Exact steps from test case
4. **Expected Result**: What should happen
5. **Actual Result**: What actually happened
6. **Environment**: OS, runtime, app version
7. **Logs**: Attach console logs
8. **Screenshots**: If applicable

---

## Test Coverage Summary

After completing all test cases, calculate coverage:

| Area | Total Tests | Passed | Failed | Coverage % |
|------|-------------|--------|--------|------------|
| Core Functionality | X | X | X | XX% |
| Containerd Runtime | X | X | X | XX% |
| Advanced Features | X | X | X | XX% |
| Auto-Recovery | X | X | X | XX% |
| Performance | X | X | X | XX% |
| Platform-Specific | X | X | X | XX% |
| **TOTAL** | **X** | **X** | **X** | **XX%** |

**Minimum acceptable coverage: 90%**

---

## Sign-Off

### Test Completion Checklist

- [ ] All test cases executed
- [ ] Results documented
- [ ] Critical bugs resolved
- [ ] Regression tests passed
- [ ] Performance benchmarks met
- [ ] Documentation reviewed
- [ ] Platform-specific tests completed
- [ ] Test coverage ≥90%

### Approvals

**Tester:**
- Name: _______________
- Date: _______________
- Signature: _______________

**Project Lead:**
- Name: _______________
- Date: _______________
- Signature: _______________

---

## Appendix: Common Issues and Fixes

### Issue: Docker Not Detected

**Symptom:** "No container runtime available" despite Docker running

**Fix:**
1. Verify Docker Desktop is running: `docker ps`
2. Check Docker socket: `ls -la /var/run/docker.sock` (macOS/Linux)
3. Restart Docker Desktop
4. Restart AInTandem Desktop

### Issue: High CPU Usage

**Symptom:** Electron Helper using >50% CPU

**Investigate:**
1. Check for infinite polling loops
2. Verify interval cleanup on unmount
3. Check for runaway log streaming
4. Profile with Chrome DevTools

### Issue: Services Won't Start

**Symptom:** Service stuck in "starting" state

**Debug:**
1. Check container logs: `docker logs {container-id}`
2. Verify dependencies running
3. Check port conflicts: `lsof -i :{port}`
4. Verify network exists: `docker network ls`
5. Check volume mounts: `docker volume ls`

### Issue: Auto-Restart Not Working

**Symptom:** Essential service stays stopped

**Debug:**
1. Check health monitoring enabled: Console shows "Starting health monitoring"
2. Verify service marked as `essential: true` in service definitions
3. Check restart attempt count: May have hit max (3 attempts)
4. Review console logs for error messages
5. Manually reset restart counter if needed

---

**End of Manual Testing Guide**

For questions or issues with this test plan, contact the development team.

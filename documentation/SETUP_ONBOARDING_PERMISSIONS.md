# 🔧 Onboarding Permissions Setup Guide

This guide will help you automatically configure Discord channel permissions for the onboarding flow using the automated script.

## 📋 What This Does

The script automatically configures Discord so that:

✅ **New members** can ONLY see `#TERMS-OF-SERVICES` channel
✅ After accepting TOS and completing questionnaire, they get the "Customer" role
✅ Customer role grants access to ALL other channels
✅ TOS channel becomes hidden once they have Customer role

---

## 🚀 Quick Setup (5 Steps)

### **Step 1: Get Your Customer Role ID**

1. Open Discord
2. Go to **Server Settings** → **Roles**
3. Find or create **Customer** role
4. Right-click the role → **Copy Role ID**

**To enable "Copy ID":**
- Go to **User Settings** → **Advanced** → Enable **Developer Mode**

---

### **Step 2: Get Your Channel IDs**

1. Right-click **#TERMS-OF-SERVICES** channel → **Copy Channel ID**
2. Right-click **#general** channel → **Copy Channel ID**

---

### **Step 3: Update .env File**

Open your `.env` file and add/update these variables:

```env
# Onboarding Configuration
DISCORD_CUSTOMER_ROLE_ID="123456789012345678"  # Your Customer role ID
DISCORD_TOS_CHANNEL_ID="987654321098765432"   # Your TOS channel ID
DISCORD_GENERAL_CHANNEL_ID="111222333444555"  # Your general channel ID
```

**Important:** Make sure these are set correctly!

---

### **Step 4: Run the Automated Setup Script**

```bash
npm run setup:permissions
```

This will:
- ✅ Connect to Discord
- ✅ Find your server and roles
- ✅ Configure `#TERMS-OF-SERVICES` channel (visible to @everyone, read-only)
- ✅ Configure ALL other text channels (hidden from @everyone, visible to Customer role)
- ✅ Set bot permissions on all channels

**Expected Output:**
```
=== Starting Discord Onboarding Permissions Setup ===
Logging in to Discord...
✅ Logged in as Morita APP#1234
✅ Found guild: Morita Gaming
✅ Found @everyone role (ID: 123456789)
✅ Found Customer role: Customer (ID: 987654321)
✅ Bot role: Morita (ID: 111222333)
✅ Found 15 channels
✅ Found TOS channel: TERMS-OF-SERVICES

--- Configuring Channel Permissions ---

Configuring: #TERMS-OF-SERVICES
  ✅ #TERMS-OF-SERVICES: @everyone can view (read-only), Customer hidden
Configuring: #general
  ✅ #general: @everyone hidden, Customer can view
Configuring: #announcements
  ✅ #announcements: @everyone hidden, Customer can view
...

✅ Successfully configured 15 channels

=== Onboarding Permissions Setup Complete ===

New Member Experience:
1. New member joins → Can ONLY see #TERMS-OF-SERVICES
2. Accepts TOS → Completes questionnaire
3. Gets Customer role → All channels appear

Test with a new account to verify!
```

---

### **Step 5: Test the Flow**

1. Create a test Discord account or use an alt account
2. Leave your Discord server
3. Rejoin using an invite link
4. **Verify:** You should ONLY see `#TERMS-OF-SERVICES` channel
5. Click **"Accept Terms"** button
6. Fill out the questionnaire
7. **Verify:** Customer role is assigned, all channels appear

---

## 🔍 What the Script Configures

### **#TERMS-OF-SERVICES Channel:**

| Role | View Channel | Send Messages |
|------|--------------|---------------|
| @everyone | ✅ Allowed | ❌ Denied |
| Customer | ❌ Denied | ❌ Denied |
| Bot | ✅ Allowed | ✅ Allowed |

**Result:** New members see this channel (read-only), but it's hidden once they get Customer role.

---

### **All Other Channels (#general, #announcements, etc.):**

| Role | View Channel | Send Messages |
|------|--------------|---------------|
| @everyone | ❌ Denied | ❌ Denied |
| Customer | ✅ Allowed | ✅ Allowed |
| Bot | ✅ Allowed | ✅ Allowed |

**Result:** New members cannot see these channels. Only visible to Customer role.

---

## 📝 Manual Alternative (If Script Fails)

If the automated script doesn't work, you can configure manually:

### **For #TERMS-OF-SERVICES channel:**

1. Right-click channel → **Edit Channel** → **Permissions**
2. **Advanced Permissions**
3. Add @everyone: View Channel ✅, Send Messages ❌
4. Add Customer: View Channel ❌
5. Add Bot: All permissions ✅

### **For ALL other channels:**

1. Right-click channel → **Edit Channel** → **Permissions**
2. **Advanced Permissions**
3. Add @everyone: View Channel ❌
4. Add Customer: View Channel ✅, Send Messages ✅
5. Add Bot: All permissions ✅

---

## ⚠️ Troubleshooting

### **Error: "DISCORD_CUSTOMER_ROLE_ID not configured"**
- Make sure you added the role ID to your `.env` file
- Restart the script after updating `.env`

### **Error: "Customer role not found"**
- The role ID is incorrect or the role was deleted
- Copy the role ID again and update `.env`

### **Error: "TOS channel not found"**
- The channel ID is incorrect or the channel was deleted
- Copy the channel ID again and update `.env`

### **Error: "Missing Permissions"**
- The bot needs **Manage Roles** and **Manage Channels** permissions
- Go to Server Settings → Roles → Bot Role → Enable these permissions

### **Script runs but permissions don't work**
- Make sure your bot role is ABOVE the Customer role in the role hierarchy
- Server Settings → Roles → Drag bot role above Customer role

### **New members still see all channels**
- Run the script again
- Verify the Customer role ID is correct
- Check that @everyone doesn't have "Administrator" permission

---

## 🎯 Understanding the Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. User joins Discord server via invite link           │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. User has @everyone role (no Customer role yet)      │
│    Can ONLY see: #TERMS-OF-SERVICES                     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. User clicks "Accept Terms" button                    │
│    TOS acceptance recorded in database                  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Questionnaire modal appears                          │
│    User fills out registration form                     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Bot assigns "Customer" role automatically            │
│    User account created in database                     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 6. ALL channels become visible                          │
│    #TERMS-OF-SERVICES becomes hidden                    │
│    Welcome message sent to #general                     │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Notes

- ✅ Bot needs **Manage Channels** permission to set channel permissions
- ✅ Bot needs **Manage Roles** permission to assign Customer role
- ✅ Bot role should be ABOVE Customer role in hierarchy
- ✅ Never give @everyone the "Administrator" permission
- ✅ Keep Customer role permissions minimal (only View/Send in channels)

---

## 📚 Files Modified by This Setup

### **Created:**
- `/src/discord-bot/scripts/setup-onboarding-permissions.ts` - The automated setup script

### **Updated:**
- `/.env.example` - Added DISCORD_CUSTOMER_ROLE_ID, DISCORD_TOS_CHANNEL_ID, DISCORD_GENERAL_CHANNEL_ID
- `/package.json` - Added `npm run setup:permissions` script

### **Uses:**
- `/src/discord-bot/config/onboarding.config.ts` - Onboarding configuration
- `/src/discord-bot/config/discord.config.ts` - Discord bot configuration

---

## 🆘 Need Help?

If you encounter issues:

1. **Check logs** - The script provides detailed output
2. **Verify .env** - Ensure all IDs are correct
3. **Check bot permissions** - Bot needs Manage Channels and Manage Roles
4. **Test manually** - Try configuring one channel manually to verify permissions work
5. **Run script again** - It's safe to run multiple times

---

## ✅ Verification Checklist

After running the script, verify:

- [ ] Script completed without errors
- [ ] All channels show "✅ Successfully configured"
- [ ] Created test account
- [ ] Test account can ONLY see #TERMS-OF-SERVICES
- [ ] Clicked "Accept Terms" button successfully
- [ ] Questionnaire modal appeared
- [ ] Filled out and submitted questionnaire
- [ ] Customer role was assigned automatically
- [ ] All channels became visible
- [ ] #TERMS-OF-SERVICES is now hidden
- [ ] Welcome message appeared in #general

If all checkboxes are ✅, your onboarding is working perfectly!

---

**Last Updated:** December 23, 2024

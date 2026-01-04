# 🧹 Discord Bot Scripts

This folder contains utility scripts for managing the Discord bot.

---

## 📝 Available Scripts

### **cleanup-ticket-channels.ts**

**Purpose:** Delete all channels in ticket categories (active and closed tickets)

**Categories cleaned:**
- Active Tickets: `1444799020928073908`
- Closed Tickets: `1451951437998330010`

---

## ⚠️ IMPORTANT WARNINGS

### **cleanup-ticket-channels.ts**

**⚠️ THIS SCRIPT WILL PERMANENTLY DELETE CHANNELS!**

- Cannot be undone
- All messages will be lost
- All channel history will be deleted
- Make backups before running

**When to use:**
- Development/testing environment
- After backing up important conversations
- When you want to start fresh with tickets
- Cleaning up old/closed tickets

**When NOT to use:**
- Production environment (unless you're sure!)
- Without backups
- If there are active customer conversations

---

## 🚀 How to Run

### **Option 1: Using npm script** (Recommended)

```bash
npm run bot:cleanup-tickets
```

### **Option 2: Using ts-node directly**

```bash
npx ts-node src/discord-bot/scripts/cleanup-ticket-channels.ts
```

---

## 🔒 Safety Features

### **Built-in Protections:**

1. **5-Second Delay**
   - Script waits 5 seconds before deleting
   - You can press `Ctrl+C` to cancel

2. **Channel Listing**
   - Shows all channels that will be deleted
   - Review before deletion starts

3. **Category Filtering**
   - Only deletes channels in specified categories
   - Other channels are safe

4. **Rate Limiting**
   - 1 second delay between deletions
   - Avoids Discord API rate limits

5. **Error Handling**
   - Continues even if some deletions fail
   - Shows summary at the end

---

## 📊 What the Script Does

### **Step-by-Step Process:**

```
1. Login to Discord ✅
   ↓
2. Fetch guild (server) ✅
   ↓
3. Get all channels ✅
   ↓
4. Filter channels in ticket categories ✅
   ↓
5. Show list of channels to delete 📋
   ↓
6. Wait 5 seconds (Ctrl+C to cancel) ⏳
   ↓
7. Delete channels one by one 🗑️
   ↓
8. Show summary ✅
   ↓
9. Logout 👋
```

---

## 📋 Example Output

```
🧹 Ticket Channels Cleanup Script
==================================================

🤖 Logging in to Discord...
✅ Bot logged in successfully
📋 Guild: Your Server Name

📊 Found 15 ticket channels to delete:
   - Active Tickets Category: 1444799020928073908
   - Closed Tickets Category: 1451951437998330010

📋 Channels to be deleted:
   - ticket-0001 (Active Tickets)
   - ticket-0002 (Active Tickets)
   - closed-ticket-0003 (Closed Tickets)
   - closed-ticket-0004 (Closed Tickets)
   ... (11 more)

⚠️  WARNING: This will permanently delete all ticket channels!
⚠️  Make sure you have backups if needed!

⏳ Starting deletion in 5 seconds...
   Press Ctrl+C to cancel

🗑️  Deleting: ticket-0001...
🗑️  Deleting: ticket-0002...
🗑️  Deleting: closed-ticket-0003...
...

==================================================
✅ Cleanup Complete!
==================================================
📊 Total channels found: 15
✅ Successfully deleted: 15
❌ Failed to delete: 0
==================================================

👋 Bot logged out
```

---

## 🛡️ Best Practices

### **Before Running:**

1. ✅ **Backup Important Conversations**
   - Export channel messages if needed
   - Save any important data

2. ✅ **Run in Development First**
   - Test in dev environment
   - Verify it works as expected

3. ✅ **Check Category IDs**
   - Verify you're targeting the right categories
   - Double-check in script code

4. ✅ **Notify Team**
   - Let support team know
   - Schedule during low-traffic time

### **During Running:**

1. ⏰ **Watch the 5-Second Timer**
   - Review the channel list
   - Press Ctrl+C if something looks wrong

2. 👀 **Monitor Progress**
   - Watch for errors
   - Check deletion count

### **After Running:**

1. 🔍 **Verify in Discord**
   - Check categories are empty
   - Confirm correct channels deleted

2. 📊 **Review Summary**
   - Check success/failure counts
   - Investigate any failed deletions

---

## ❓ FAQ

### **Q: Will this delete the categories themselves?**
A: No, only the channels inside the categories. The category channels remain.

### **Q: Can I undo this?**
A: No, channel deletion is permanent. Make backups first!

### **Q: Will it delete channels in other categories?**
A: No, only channels in the two specified ticket categories.

### **Q: What if I want to keep some channels?**
A: Move them to a different category before running the script.

### **Q: How long does it take?**
A: About 1 second per channel (to avoid rate limits). 15 channels ≈ 15 seconds.

### **Q: What if it fails halfway?**
A: The script will continue and show which channels failed. You can run it again to clean up remaining channels.

### **Q: Can I change which categories to clean?**
A: Yes, edit the script and change `TICKETS_CATEGORY_ID` and `CLOSED_TICKETS_CATEGORY_ID` constants.

---

## 🔧 Customization

### **To change target categories:**

Edit `cleanup-ticket-channels.ts`:

```typescript
// Change these IDs
const TICKETS_CATEGORY_ID = "1444799020928073908";
const CLOSED_TICKETS_CATEGORY_ID = "1451951437998330010";
```

### **To change the delay:**

```typescript
// Change from 5000ms (5 seconds) to 10000ms (10 seconds)
await new Promise((resolve) => setTimeout(resolve, 10000));
```

### **To remove confirmation delay:**

```typescript
// Comment out these lines (NOT RECOMMENDED!)
// logger.info("\n⏳ Starting deletion in 5 seconds...");
// await new Promise((resolve) => setTimeout(resolve, 5000));
```

---

## 🚨 Emergency Stop

If the script is running and you need to stop it:

**Press:** `Ctrl + C`

The script will stop immediately and exit safely.

---

## 📝 Notes

- Script uses bot token from `.env`
- Requires `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID`
- Bot must have `MANAGE_CHANNELS` permission
- Deletes channels one at a time (safe for API limits)
- Logs all actions for audit trail

---

## 🆘 Support

If you encounter issues:

1. Check bot permissions
2. Verify `.env` has correct values
3. Check Discord API status
4. Review error messages in console
5. Contact administrator if needed

---

**Created:** January 4, 2026
**Last Updated:** January 4, 2026

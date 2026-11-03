import { inngest } from "@/lib/inngest/client";
import { NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT } from "@/lib/inngest/prompts";
import { sendNewsSummaryEmail, sendStockAlertEmail, sendWelcomeEmail } from "@/lib/nodemailer";
import { getAllUsersForNewsEmail, getWatchlistSymbolsByEmail } from "@/lib/actions/user.actions";
import { getNews } from "@/lib/actions/finnhub.actions";
import { getFormattedTodayDate } from "@/lib/utils";
import { callAIProviderWithFallback } from "@/lib/ai-provider";
import { refreshScreenerSlice, SCREENER_BATCH_LIMIT } from "@/lib/screener-refresh";
import { SCREENER_TOTAL } from "@/lib/screener-universe";
import type { AlertCondition } from "@/lib/alerts";
import type { Candle } from "@/lib/yahoo-candles";
import type { Lang } from "@/lib/i18n";

export const sendSignUpEmail = inngest.createFunction(
    { id: 'sign-up-email', triggers: [{ event: 'app/user.created' }] },
    async ({ event, step }) => {
        const userProfile = `
            - Country: ${event.data.country}
            - Investment goals: ${event.data.investmentGoals}
            - Risk tolerance: ${event.data.riskTolerance}
            - Preferred industry: ${event.data.preferredIndustry}
        `

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', userProfile)


        const introText = await step.run('generate-welcome-intro', async () => {
            try {
                return await callAIProviderWithFallback(prompt);
            } catch (error) {
                console.error("⚠️ All AI providers failed for welcome email", error);
                return 'Thanks for joining Rovex. You now have the tools to track markets and make smarter moves.';
            }
        });

        const emailResult = await step.run('send-welcome-email', async () => {
            try {

                const { data: { email, name } } = event;
                // introText is already a plain string from the AI provider

                console.log(`📧 Attempting to send welcome email to: ${email}`);
                const result = await sendWelcomeEmail({ email, name, intro: introText });
                if (result.status !== 'sent') {
                    console.log(`Welcome email skipped for: ${email}`);
                    return result;
                }
                console.log(`✅ Welcome email sent successfully to: ${email}`);
                return result;
            } catch (error) {
                console.error('❌ Error sending welcome email:', error);
                throw error;
            }
        })

        return emailResult.status === 'sent'
            ? { success: true, message: 'Welcome email sent successfully' }
            : { success: true, message: 'Welcome email skipped because email credentials are not configured' };
    }
)

// Rename to Weekly
export const sendWeeklyNewsSummary = inngest.createFunction(
    { id: 'weekly-news-summary', triggers: [{ event: 'app/send.weekly.news' }, { cron: '0 9 * * 1' }] }, // Every Monday at 9AM
    async ({ step }) => {
        // Step 1: Fetch General Market News
        const articles = await step.run('fetch-general-news', async () => {
            const { getNews } = await import("@/lib/actions/finnhub.actions");
            const news = await getNews();
            // Ideally getNews would accept range, but getting latest 10 is good for summary
            return (news || []).slice(0, 10);
        });

        if (!articles || articles.length === 0) {
            return { message: 'No news available to summarize.' };
        }

        // Doing AI step outside 'run' to use Inngest AI wrapper features properly
        const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace('{{newsData}}', JSON.stringify(articles, null, 2))
            .replace('daily', 'weekly')
            .replace('Daily', 'Weekly');


        const summaryText = await step.run('generate-news-summary', async () => {
            try {
                return await callAIProviderWithFallback(prompt);
            } catch (error) {
                console.error("⚠️ All AI providers failed for news summary", error);
                return 'Market is moving. Log in to see more.';
            }
        });

        // Step 3: Send Broadcast via Kit
        await step.run('send-kit-broadcast', async () => {
            const { kit } = await import("@/lib/kit");
            const { getFormattedTodayDate } = await import("@/lib/utils");

            // Fetch subscribers for verification log
            try {
                const subData = await kit.listSubscribers();
                const subscriberList = subData.subscribers || [];
                const confirmedCount = subscriberList.filter((s: { state?: string }) => s.state === 'active').length;

                console.log(`📋 Target Audience: Found ${subData.total_subscribers} total subscribers in Kit.`);
                console.log(`✅ Confirmed (Active) Subscribers receiving email: ${confirmedCount}`);

            } catch (e) {
                console.warn("Could not list subscribers for logging:", e);
            }

            const date = getFormattedTodayDate();
            const subject = `📈 Weekly Market Summary - ${date}`;

            // --- HTML EMAIL TEMPLATE ---
            // Using inline styles for compatibility. Accent Color: Teal (#C9F36A)

            const content = `
            <!DOCTYPE html>
            <html>
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                
                <!-- Main Container -->
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #000000; padding: 20px;">
                    <tr>
                        <td align="center">
                            
                            <!-- Content Wrapper with Teal Border -->
                            <div style="max-width: 600px; width: 100%; border: 2px dashed #C9F36A; border-radius: 4px; padding: 2px;"> 
                                <div style="background-color: #000000; padding: 30px 20px;">
                                    
                                    <!-- Header / Logo -->
                                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                                        <tr>
                                            <td style="border-bottom: 1px dashed #333; padding-bottom: 20px;">
                                                 <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; display: flex; align-items: center;">
                                                    <span style="color: #C9F36A; margin-right: 10px;">📊</span> Rovex
                                                 </h2>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Date & Title -->
                                    <div style="margin-bottom: 30px;">
                                        <h1 style="margin: 0 0 10px 0; font-size: 28px; font-weight: 700; color: #ffffff; line-height: 1.2;">Weekly Market News</h1>
                                        <p style="margin: 0; color: #888888; font-size: 16px;">${date}</p>
                                    </div>

                                    <!-- AI Summary Content -->
                                    <div style="text-align: left;">
                                        ${summaryText
                    .replace(/<h3/g, '<h3 style="color: #ffffff; margin-top: 30px; margin-bottom: 15px; font-size: 20px;"')
                    .replace(/<div class="dark-info-box"/g, '<div style="background-color: #1e1e1e; padding: 20px; border-radius: 8px; margin-bottom: 25px;"')
                    .replace(/<h4/g, '<h4 style="color: #ffffff; margin-top: 0; margin-bottom: 15px; font-size: 18px; line-height: 1.4;"')
                    .replace(/<ul/g, '<ul style="padding-left: 0; list-style-type: none; margin: 0 0 15px 0;"')
                    .replace(/<li/g, '<li style="margin-bottom: 12px; color: #cccccc; font-size: 16px; line-height: 1.6; display: flex;"')
                    .replace(/class="dark-text-secondary"/g, '')
                    .replace(/•/g, '<span style="color: #C9F36A; font-weight: bold; margin-right: 10px; font-size: 18px;">•</span>') // Teal bullets
                    .replace(/<strong style="color: #C9F36A;">/g, '<strong style="color: #C9F36A;">') // Teal strong text
                    .replace(/<a /g, '<a style="color: #C9F36A; text-decoration: none; font-weight: 600;" ') // Teal links
                }
                                    </div>

                                    <!-- Footer -->
                                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 40px; border-top: 1px dashed #333; padding-top: 20px;">
                                        <tr>
                                            <td align="center" style="color: #666666; font-size: 14px; line-height: 1.5;">
                                                <p style="margin: 0 0 10px 0;">You're receiving this email because you signed up for Rovex.</p>
                                                <p style="margin: 0;">
                                                    <a href="{{ unsubscribe_url }}" style="color: #C9F36A; text-decoration: underline;">Unsubscribe</a>
                                                    <span style="margin: 0 10px;">•</span>
                                                    <a href="https://openstock.rovexjo.com" style="color: #C9F36A; text-decoration: underline;">Visit Rovex</a>
                                                </p>
                                                <p style="margin: 20px 0 0 0; font-size: 12px;">&copy; ${new Date().getFullYear()} Rovex · Powered by Rovex · AGPL-3.0</p>
                                            </td>
                                        </tr>
                                    </table>

                                </div>
                            </div>

                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `;

            console.log(`📢 Sending Weekly News Broadcast to all subscribers`);
            const broadcastResult = await kit.sendBroadcast(subject, content);
            console.log("👉 Kit API Response:", JSON.stringify(broadcastResult, null, 2));
            return { success: true, kitResponse: broadcastResult };
        })

        return { success: true, message: 'Weekly news broadcast sent' }
    }
)

export const checkStockAlerts = inngest.createFunction(
    { id: 'check-stock-alerts', concurrency: 1, triggers: [{ cron: '*/5 * * * *' }] }, // Every 5 minutes; one run at a time so an alert is never emailed twice
    async ({ step }) => {
        // Step 1: Fetch active alerts
        const activeAlerts = await step.run('fetch-active-alerts', async () => {
            // Dynamic import to avoid circular dep issues if any, or just standard import
            const { connectToDatabase } = await import("@/database/mongoose");
            const { Alert } = await import("@/database/models/alert.model");

            await connectToDatabase();
            const now = new Date();

            return await Alert.find({
                active: true,
                triggered: false,
                expiresAt: { $gt: now }
            }).lean();
        });

        if (!activeAlerts || activeAlerts.length === 0) {
            return { message: 'No active alerts to check.' };
        }

        // Step 2: Group by symbol
        type StoredAlert = {
            _id: unknown;
            userId: string;
            symbol: string;
            condition: AlertCondition;
            targetPrice: number;
            params?: { period?: number; window?: number };
            lastPrice?: number | null;
        };
        const alerts = activeAlerts as unknown as StoredAlert[];
        const symbols = [...new Set(alerts.map((alert) => alert.symbol))];

        // Step 3: Price each symbol through the source lib/alerts.ts picked for it — Yahoo for
        // Tadawul, Finnhub for US stocks and crypto. The same routing the on-visit check uses.
        const prices = await step.run('fetch-prices', async () => {
            const { alertSource, alertYahooSymbol } = await import("@/lib/alerts");
            const { getLiveQuotes } = await import("@/lib/actions/finnhub.actions");
            const { getYahooDailyQuotes } = await import("@/lib/actions/yahoo.actions");

            const snapshots: Record<string, { price: number; changePercent: number }> = {};
            const yahoo = symbols.filter((symbol) => alertSource(symbol) === 'yahoo');
            const finnhub = symbols.filter((symbol) => alertSource(symbol) === 'finnhub');

            if (yahoo.length > 0) {
                const quotes = await getYahooDailyQuotes(yahoo.map((symbol) => alertYahooSymbol(symbol) ?? symbol));
                for (const symbol of yahoo) {
                    const quote = quotes[alertYahooSymbol(symbol) ?? symbol];
                    // The same liveness test the on-visit check uses, so the two agree on a 0 quote.
                    if (quote && Number.isFinite(quote.price)) snapshots[symbol] = { price: quote.price, changePercent: quote.changePercent };
                }
            }
            if (finnhub.length > 0) {
                const quotes = await getLiveQuotes(finnhub);
                for (const symbol of finnhub) {
                    const quote = quotes[symbol];
                    if (quote && Number.isFinite(quote.c)) snapshots[symbol] = { price: quote.c as number, changePercent: Number(quote.dp ?? 0) };
                }
            }
            return snapshots;
        });

        // Step 4: the same decision the alert centre makes, from the same pure function, so the
        // two paths cannot disagree about what fired or what the next cross compares against.
        const { needsCandles, planCheck } = await import("@/lib/alerts");
        type Snapshot = { price: number; changePercent: number };
        const rows = alerts.map((alert) => ({
            id: String(alert._id),
            symbol: alert.symbol,
            condition: alert.condition,
            targetPrice: alert.targetPrice,
            params: alert.params ?? {},
            lastPrice: alert.lastPrice ?? null,
        }));

        // Only the symbols whose rules measure a series pay for candles; the rest live on quotes.
        const measured = [...new Set(rows.filter((row) => needsCandles(row.condition)).map((row) => row.symbol))];
        const series = measured.length > 0
            ? await step.run('fetch-candles', async () => {
                const { getAlertCandles } = await import("@/lib/actions/yahoo-candles.actions");
                const sets = await Promise.all(
                    measured.map(async (symbol) => {
                        const set = await getAlertCandles(symbol);
                        return set?.candles?.length ? ([symbol, set.candles] as const) : null;
                    }),
                );
                return Object.fromEntries(sets.filter((entry): entry is readonly [string, Candle[]] => entry !== null));
            })
            : {};

        const plan = planCheck(rows, prices as Record<string, Snapshot>, series as Record<string, Candle[]>);

        // Remember what each rule saw on this check, so a cross has a previous value next time.
        if (plan.misses.length > 0) {
            await step.run('remember-prices', async () => {
                const { connectToDatabase } = await import("@/database/mongoose");
                const { Alert } = await import("@/database/models/alert.model");
                await connectToDatabase();
                await Alert.bulkWrite(
                    plan.misses.map(({ id, value }) => ({
                        updateOne: { filter: { _id: id, triggered: false }, update: { $set: { lastPrice: value } } },
                    })),
                );
            });
        }

        // Step 5: Claim what fired, email the price rules, and keep the rest in-app.
        if (plan.fires.length > 0) {
            await step.run('process-triggered-alerts', async () => {
                const { connectToDatabase } = await import("@/database/mongoose");
                const { Alert } = await import("@/database/models/alert.model");
                const mongoose = await connectToDatabase();
                const db = mongoose.connection.db;
                if (!db) throw new Error("No DB Connection");

                const byId = new Map(alerts.map((alert) => [String(alert._id), alert]));

                for (const fire of plan.fires) {
                    const alert = byId.get(fire.id);
                    if (!alert) continue;
                    // Claim the alert atomically before emailing. Inngest's concurrency limits steps, not
                    // whole runs, so two overlapping runs can hold the same alert; only one wins this update.
                    const claimed = await Alert.findOneAndUpdate(
                        { _id: alert._id, active: true, triggered: false },
                        {
                            $set: {
                                triggered: true,
                                active: false,
                                triggeredAt: new Date(),
                                triggeredPrice: fire.value,
                                lastPrice: fire.value,
                                seen: false,
                            },
                        },
                    );
                    if (!claimed) continue;
                    const release = () => Alert.findByIdAndUpdate(alert._id, {
                        triggered: false,
                        active: true,
                        triggeredAt: null,
                        triggeredPrice: null,
                    }).catch(() => {});

                    console.log(`🚀 ALERT FIRED: ${alert.symbol} is ${fire.value} (${alert.condition} ${alert.targetPrice})`);

                    // Beside the mail: a notification for every rule kind, in the language each
                    // device subscribed in. A push service that is down must not fail the step.
                    try {
                        const { sendToUser } = await import("@/lib/push-send");
                        const { alertPushPayload } = await import("@/lib/push");
                        const { alertConditionLabel, alertTargetLabel, measureLabel } = await import("@/lib/alert-labels");
                        await sendToUser(alert.userId, (lang) => {
                            const reader = (lang === 'ar' ? 'ar' : 'en') as Lang;
                            return alertPushPayload({
                                symbol: alert.symbol,
                                label: `${alertConditionLabel(reader, alert.condition)} ${alertTargetLabel(reader, alert.condition, alert.targetPrice)}`,
                                value: measureLabel(reader, alert.condition, fire.value),
                            });
                        });
                    } catch (error) {
                        console.error(`⚠️ Push failed for ${alert.symbol}`, error);
                    }

                    // The mail templates speak in prices; the four newer rules are announced in the
                    // alert centre only, so an e-mail never quotes a percentage as a price.
                    if (alert.condition !== 'ABOVE' && alert.condition !== 'BELOW') continue;

                    // Per-alert try/catch: a failure releases the claim so the next 5-min run retries it,
                    // and never throws the step (a step retry would re-email alerts already sent in this loop).
                    try {
                        // Better Auth users may be keyed by `id` or `_id` (see getWatchlistSymbolsByEmail)
                        const user = await db.collection('user').findOne<{ email?: string }>(
                            mongoose.isValidObjectId(alert.userId)
                                ? { $or: [{ id: alert.userId }, { _id: new mongoose.Types.ObjectId(alert.userId) }] }
                                : { id: alert.userId }
                        );

                        if (user?.email) {
                            const result = await sendStockAlertEmail({
                                email: user.email,
                                symbol: alert.symbol,
                                // The mail speaks in prices, and it is only sent for the price rules.
                                currentPrice: fire.price ?? fire.value,
                                targetPrice: alert.targetPrice,
                                condition: alert.condition,
                            });
                            // Email not configured: release so the alert fires once email works
                            if (result.status === 'skipped') await release();
                        } else {
                            console.warn(`⚠️ No email for user ${alert.userId}; closing alert ${alert._id} without notifying`);
                        }
                    } catch (error) {
                        await release();
                        console.error(`❌ Failed to process alert ${alert._id} (${alert.symbol}); will retry next run`, error);
                    }
                }
            });
        }

        return {
            processed: activeAlerts.length,
            triggered: plan.fires.length
        };
    }
);

export const checkInactiveUsers = inngest.createFunction(
    { id: 'check-inactive-users', triggers: [{ cron: '0 10 * * *' }] }, // Run every day at 10 AM
    async ({ step }) => {
        // Step 1: Fetch Inactive Users
        const inactiveUsers = await step.run('fetch-inactive-users', async () => {
            const { connectToDatabase } = await import("@/database/mongoose");
            const mongoose = await connectToDatabase();
            const db = mongoose.connection.db;
            if (!db) throw new Error("No DB Connection");

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Criteria:
            // 1. lastActiveAt < 30 days ago OR (undefined and createdAt < 30 days ago)
            // 2. lastReengagementSentAt < 30 days ago OR undefined (don't spam)
            const users = await db.collection('user').find({
                $and: [
                    {
                        $or: [
                            { lastActiveAt: { $lt: thirtyDaysAgo } },
                            { lastActiveAt: { $exists: false }, createdAt: { $lt: thirtyDaysAgo } }
                        ]
                    },
                    {
                        $or: [
                            { lastReengagementSentAt: { $exists: false } },
                            { lastReengagementSentAt: { $lt: thirtyDaysAgo } }
                        ]
                    }
                ]
            }, { projection: { email: 1, name: 1, _id: 1 } }).limit(50).toArray(); // Limit 50 per run for safety

            return users.map(u => ({ email: u.email, name: u.name, id: u._id.toString() }));
        });

        if (inactiveUsers.length === 0) {
            return { message: "No inactive users found." };
        }

        // Step 2: Send Emails
        const results = await step.run('send-reengagement-emails', async () => {
            const { connectToDatabase } = await import("@/database/mongoose");
            const mongoose = await connectToDatabase();
            const db = mongoose.connection.db;

            const sent = 0; // nothing is sent until a 1:1 sender exists

            for (const user of inactiveUsers) {
                if (!user.email) continue;

                const firstName = user.name ? user.name.split(' ')[0] : 'Indiestocker';
                const subject = `🔔 ${firstName}, opportunities are waiting for you`;

                // --- HTML TEMPLATE (Teal) ---
                const content = `
                <!DOCTYPE html>
                <html>
                <body style="margin: 0; padding: 0; background-color: #000000; font-family: sans-serif; color: #ffffff;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 20px;">
                        <tr>
                            <td align="center">
                                <div style="max-width: 600px; width: 100%; border: 2px dashed #C9F36A; border-radius: 4px; padding: 2px;">
                                    <div style="background-color: #111; padding: 40px 30px; text-align: left;">
                                        
                                        <!-- Logo -->
                                        <h2 style="margin: 0 0 30px 0; font-size: 24px; color: #ffffff; display: flex; align-items: center;">
                                            <span style="color: #C9F36A; margin-right: 10px;">📊</span> Rovex
                                        </h2>

                                        <!-- Title -->
                                        <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #ffffff;">We Miss You, ${firstName}</h1>

                                        <p style="color: #cccccc; font-size: 16px; line-height: 1.6;">
                                            Hi ${firstName},<br><br>
                                            We noticed you haven't visited Rovex in a while. The markets have been moving, and there might be some opportunities you don't want to miss!
                                        </p>

                                        <!-- Card -->
                                        <div style="background-color: #1e1e1e; padding: 20px; border-radius: 8px; margin: 30px 0;">
                                            <h3 style="color: #C9F36A; margin: 0 0 10px 0; font-size: 18px;">Market Update</h3>
                                            <p style="color: #cccccc; margin: 0; font-size: 14px; line-height: 1.5;">
                                                Markets have been active lately! Major indices have seen significant movements, and there might be opportunities in your tracked stocks that you don't want to miss.
                                            </p>
                                        </div>

                                        <p style="color: #cccccc; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                                            Your watchlists are still active and ready to help you stay on top of your investments. Don't let market opportunities pass you by!
                                        </p>

                                        <!-- Button -->
                                        <table border="0" cellspacing="0" cellpadding="0" width="100%">
                                            <tr>
                                                <td align="center">
                                                    <a href="https://openstock.rovexjo.com" style="display: inline-block; background-color: #C9F36A; color: #000000; font-weight: bold; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-size: 16px;">Return to Dashboard</a>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="margin-top: 40px; color: #666; font-size: 14px;">
                                            Stay sharp,<br>Rovex Team
                                        </p>

                                        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #333; text-align: center; font-size: 12px; color: #666;">
                                            <p>You received this because you are an Rovex user.</p>
                                            <a href="#" style="color: #C9F36A;">Unsubscribe</a>
                                        </div>

                                    </div>
                                </div>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
                 `;

                try {
                    // Using sendBroadcast to simulate transactional email (target user receives "Broadcast" with just them in list?)
                    // Ideally we used 'kit.addSubscriber' with a sequence, but for single template sending to one user,
                    // the Kit API is restrictive. 
                    // WORKAROUND: We will use 'sendBroadcast' but we really need to filter it to THIS user.
                    // Since 'kit.ts' handles global broadcasts, sending individual emails via 'broadcast' endpoint is DANGEROUS 
                    // unless properly filtered.
                    // 
                    // BETTER APPROACH FOR THIS TASK:
                    // Since we can't easily send 1-to-1 via Kit Broadcasts API without creating 7500 broadcasts,
                    // and we don't have transactional email set up for Kit.
                    //
                    // I will log this action for now and note that specific transactional send requires Kit Transactional Addon or Tag-Trigger.
                    // BUT, to satisfy the user request "add this", I will mock the send call to our broadcast function 
                    // OR actually implement a 'sendTransactional' if possible.
                    //
                    // Looking at Kit API, 'POST /v3/courses/{course_id}/subscribe' triggers a sequence.
                    //
                    // Let's rely on the previous assumption: Just use the same Broadcast mechanism but we'd need to TAG them.
                    //
                    // FOR NOW: I will just LOG the email content generation and the INTENT to send.
                    // To make it functional, I would need to add a "Re-engagement" tag to the user in Kit, 
                    // then send a broadcast to that Tag.

                    // Adding the tag logic inline to make it work:
                    // 1. Add tag "Inactive" to user.
                    // 2. (This is too slow for loop).

                    // Not sent. kit.sendBroadcast mails the whole list, so a "test user" send here went to every
                    // subscriber. Wire up a 1:1 send (Kit tag + sequence, or nodemailer) before enabling this, and
                    // only then set lastReengagementSentAt and count it: marking unsent users would skip them for 30 days.
                    void subject; void content; void db;
                } catch (e) {
                    console.error("Failed to process user", user.id, e);
                }
            }
            return sent;
        });

        return { processed: inactiveUsers.length, sent: results };
    }
);

// Keeps the screener snapshot warm without anyone opening the page. Walks the universe in batches,
// one step each, so a slow Yahoo day does not fail the whole run.
export const refreshScreener = inngest.createFunction(
    { id: 'refresh-screener', concurrency: 1, triggers: [{ cron: '0 6 * * *' }] }, // Daily at 06:00
    async ({ step }) => {
        const offsets: number[] = [];
        for (let offset = 0; offset < SCREENER_TOTAL; offset += SCREENER_BATCH_LIMIT) offsets.push(offset);

        let priced = 0;
        for (const offset of offsets) {
            const result = await step.run(`screener-batch-${offset}`, () => refreshScreenerSlice(offset, SCREENER_BATCH_LIMIT));
            priced += result.priced;
        }
        return { batches: offsets.length, priced };
    }
);
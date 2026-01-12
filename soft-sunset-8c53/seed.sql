-- Seed data for feedback table
-- Realistic SaaS product feedback entries

INSERT INTO feedback (source, content, sentiment, tags, created_at) VALUES
('Email', 'The new dashboard UI is absolutely fantastic! The redesign makes it so much easier to navigate and find what I need. Great work on improving the user experience.', 'Positive', 'UI,User Experience,Navigation', datetime('now', '-5 days')),
('Website', 'I''ve been experiencing login issues for the past week. Every time I try to log in, I get an error message saying "Invalid credentials" even though I know my password is correct. This is really frustrating.', 'Negative', 'Login,Bug,Authentication', datetime('now', '-4 days')),
('App Store', 'Love the app! The interface is clean and intuitive. However, the pricing seems a bit steep compared to competitors. Would love to see more flexible pricing tiers.', 'Neutral', 'Pricing,UI,Competition', datetime('now', '-3 days')),
('Support Ticket', 'Cannot log into my account. Password reset emails are not arriving. This is blocking my work and I need immediate assistance.', 'Negative', 'Login,Password Reset,Urgent', datetime('now', '-3 days')),
('Social Media', 'Just upgraded to the Pro plan and wow! The new features are incredible. The UI improvements alone are worth the upgrade. Highly recommend!', 'Positive', 'Pricing,Features,UI', datetime('now', '-2 days')),
('Survey', 'The product is good overall, but the pricing model doesn''t work for small teams. We need a more affordable option for startups with limited budgets.', 'Negative', 'Pricing,Small Business,Startups', datetime('now', '-2 days')),
('In-App Feedback', 'Beautiful UI design! The color scheme and layout are perfect. Navigation is smooth and everything feels responsive. Best update yet!', 'Positive', 'UI,Design,Performance', datetime('now', '-1 days')),
('Email', 'Having trouble logging in after the latest update. The login page keeps redirecting me in a loop. Please fix this bug ASAP.', 'Negative', 'Login,Bug,Update Issues', datetime('now', '-1 days')),
('Website', 'The user interface is amazing - so much better than before! But I think the pricing could be more competitive. Maybe offer annual discounts?', 'Neutral', 'UI,Pricing,Discounts', datetime('now', '-12 hours')),
('Chat Support', 'Login credentials not working. Tried multiple times and even reset password but still cannot access my account. This is urgent.', 'Negative', 'Login,Authentication,Urgent', datetime('now', '-6 hours'));

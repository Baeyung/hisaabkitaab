package io.github.baeyung.hisaabkitaab.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on the one scheduled job in the application — {@code ReportScheduler}, which sends the
 * shops their daily reports and monthly khata reminders.
 *
 * <p>Deliberately the plain Spring scheduler and nothing more. It runs on a single thread, which
 * is what a minute-ticking job that usually finds nothing to do wants, and it assumes a single
 * backend — see {@code docker-compose.yml}, where there is one. A second instance would need
 * both a shared lock and a shared {@code app.reports.secret}; until then, adding either would be
 * machinery guarding against a deployment that does not exist.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig
{
}

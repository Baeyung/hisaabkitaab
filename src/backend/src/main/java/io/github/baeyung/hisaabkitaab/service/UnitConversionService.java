package io.github.baeyung.hisaabkitaab.service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.units.UnitConversionRequest;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.UnitConversion;
import io.github.baeyung.hisaabkitaab.repository.UnitConversionRepository;
import lombok.RequiredArgsConstructor;

/**
 * The rates a shop has taught us, kept so the next entry does not have to ask again.
 *
 * <p>This service converts nothing. Quantities arrive already in the catalogue item's unit —
 * the entry screens do the arithmetic, because that is where the shopkeeper can see it and
 * approve it — and all that is wanted back here is somewhere durable to keep the one thing
 * only they know: what a than, a bori, a roll is worth in the unit the shelf counts in.
 * Everything with a fixed answer (metre/gaz, kilo/gram, dozen/piece) is a table in the
 * frontend, identical in every shop and not worth a row each.
 *
 * <p>The whole of the interesting behaviour is {@link #canonical}: a rate is symmetric, so
 * the pair is sorted before it is stored and the factor inverted to match. One fact, one row,
 * nowhere for the two directions to disagree.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class UnitConversionService
{
    private static final Logger log = LoggerFactory.getLogger(UnitConversionService.class);

    /**
     * Working precision for the inversion. Wide enough that a round trip through
     * {@code 1/x} and back lands on the number that went in, for any rate a shopkeeper would
     * type; the column then rounds to its own eight places on the way to disk.
     */
    private static final MathContext INVERSION = new MathContext(20, RoundingMode.HALF_UP);

    private final UnitConversionRepository repository;

    @Transactional(readOnly = true)
    public List<UnitConversion> findByStore(String storeId)
    {
        return repository.findByStoreId(storeId);
    }

    /**
     * Teach or correct one rate. Idempotent on the pair: saying "1 than = 22 metre" twice
     * leaves one row, and saying "1 metre = 0.05 than" afterwards rewrites that same row
     * rather than adding a second, contradictory one.
     */
    public UnitConversion save(UnitConversionRequest request, Store store)
    {
        Pair pair = canonical(request.fromUnit(), request.toUnit(), request.factor());

        UnitConversion existing = repository
                .findByStoreIdAndFromUnitAndToUnit(store.getId(), pair.from(), pair.to())
                .orElse(null);

        // Both the folding and the sorting can leave the stored row looking nothing like what
        // was typed ("1 than = 22 metre" stored as metre→than at 0.0454…). Logging the pair as
        // sent and as stored is what makes a rate that "went in wrong" checkable.
        log.info("{} rate for store {}: {} {} -> {} {} stored as {} -> {} at {}",
                existing != null ? "correcting" : "learning", store.getId(),
                request.factor(), request.fromUnit(), 1, request.toUnit(),
                pair.from(), pair.to(), pair.factor());

        if (existing != null)
        {
            existing.setFactor(pair.factor());
            return repository.save(existing);
        }

        return repository.save(UnitConversion.builder()
                .store(store)
                .fromUnit(pair.from())
                .toUnit(pair.to())
                .factor(pair.factor())
                .build());
    }

    /**
     * The pair as it is stored: both units folded, ordered alphabetically, and the factor
     * turned around if the ordering had to swap them.
     *
     * <p>Sorting is what makes one row per pair possible. Without it "than→metre" and
     * "metre→than" are two rows describing the same fact, and the day they disagree the shop
     * gets a different answer depending on which way the shopkeeper happened to be working.
     * With it there is one row, and the direction the caller wanted is a division away.
     */
    private Pair canonical(String from, String to, BigDecimal factor)
    {
        String a = fold(from);
        String b = fold(to);

        if (a.equals(b))
        {
            log.warn("refusing a rate from \"{}\" to \"{}\": both fold to \"{}\"", from, to, a);
            throw new IllegalArgumentException("A unit converts to itself at 1; nothing to store.");
        }

        return a.compareTo(b) <= 0
                ? new Pair(a, b, factor)
                : new Pair(b, a, BigDecimal.ONE.divide(factor, INVERSION));
    }

    /**
     * How a unit is keyed: trimmed and lower-cased, so "Meter", "meter" and " METER " are one
     * unit. {@link Locale#ROOT} rather than the default, so a Turkish server does not fold
     * "GAZ" onto a dotless ı and split the shop's rates in two.
     */
    public static String fold(String unit)
    {
        return unit == null ? "" : unit.trim().toLowerCase(Locale.ROOT);
    }

    private record Pair(String from, String to, BigDecimal factor)
    {
    }
}

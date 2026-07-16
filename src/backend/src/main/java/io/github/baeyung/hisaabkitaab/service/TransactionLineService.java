package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.entity.TransactionLine;

import java.util.List;

public interface TransactionLineService
{
    TransactionLine create(TransactionLine request);

    List<TransactionLine> upsertAll(List<TransactionLine> request);
}

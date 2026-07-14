package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.entity.Store;

public interface StoreService
{
    Store findFirstByOwnerIdentifier(String identifier);
}

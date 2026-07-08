package io.github.baeyung.hisaabkitaab.exception;

public class ResourceNotFoundException extends RuntimeException
{
    public ResourceNotFoundException(String message)
    {
        super(message);
    }

    public static ResourceNotFoundException forEntity(String entityName, String id)
    {
        return new ResourceNotFoundException(entityName + " not found with id " + id);
    }
}
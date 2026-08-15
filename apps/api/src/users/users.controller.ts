import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  updatePreferencesSchema,
  updateProfileSchema,
  type CurrentUser as CurrentUserView,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@flowsync/shared';
import { CurrentUser } from '../common/decorators';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user profile and preferences' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserView> {
    return this.users.get(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update name, timezone or avatar' })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<CurrentUserView> {
    return this.users.updateProfile(user.userId, body);
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Update theme and notification preferences' })
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updatePreferencesSchema)) body: UpdatePreferencesInput,
  ): Promise<CurrentUserView> {
    return this.users.updatePreferences(user.userId, body);
  }
}

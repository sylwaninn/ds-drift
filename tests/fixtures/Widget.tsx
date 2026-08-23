import React from 'react'
import styled from 'styled-components'
import { Button } from '@acme/ui'
import { Card, List } from '@mui/material'
// ds-drift-ignore component/off-ds-import
import { Tabs } from '@headlessui/react'
import type { ComponentType } from 'react'
import { helper } from './utils'

const Fancy = styled.div`
  color: #3b82f6;
  margin: 13px;
  padding: ${(props: { pad: number }) => props.pad}px 4px;
  background: var(--color-primary);
`

export const Widget: ComponentType = () => (
  <div style={{ color: '#3a81f5', marginTop: 13, padding: '0.5rem' }}>
    {/* ds-drift-ignore color/hardcoded-exact-token */}
    <span style={{ color: '#3b82f6' }}>hi</span>
    <Button>{helper()}</Button>
    <Card>
      <List />
    </Card>
    <Fancy pad={2} />
  </div>
)
